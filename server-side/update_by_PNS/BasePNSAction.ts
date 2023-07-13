import { AddonData, AddonDataScheme, PapiClient } from '@pepperi-addons/papi-sdk'
import { Client } from '@pepperi-addons/debug-server'
import { CommonMethods } from '../CommonMethods';
import fetch from "node-fetch";
import jwtDecode from 'jwt-decode';
import SystemHealthService from '../system_health.service';

export abstract class BasePNSAction {

    client: Client;
    papiClient: PapiClient;
    dataIndexType: string;
    pnsObjects : any[];

    abstract internalExecute(): any;

    constructor(inClient: Client,inDataIndexType: string, inPnsObject : any) {
        this.client = inClient;
        this.papiClient = CommonMethods.getPapiClient(this.client);
        this.dataIndexType = inDataIndexType;
        this.pnsObjects = inPnsObject["Message"]["ModifiedObjects"];

        console.log(`inPnsObject ${JSON.stringify(inPnsObject)}`)
        console.log(`PnsObjects ${JSON.stringify(this.pnsObjects)}`)

    }

    async execute(){   
        return await this.internalExecute();
    }

    public collectUUIDsOfPNSObjects(subscribedFields: string[]):string[] {
        var UUIDs: string[] = [];
        this.pnsObjects.forEach(pnsObject => {

            var updatedFields = pnsObject["ModifiedFields"];

            for (var i = 0; i < updatedFields.length; i++) 
            { 
                //check the fields in pnsObject – if at least one is field we subscribed to (on the SubscribedFields) – save the row UUID on a side list
                if (subscribedFields.includes(updatedFields[i]["FieldID"])) 
                {
                    UUIDs.push(pnsObject["ObjectKey"]);
                    break;
                }
            }
        });

        return UUIDs;
    }
    protected getAdditionalFieldsForSearch(): string {
        return ",Hidden";
    }

    public async getDataFromApi(UUIDs: string[], fields: string[], apiResuorce : string){

        let start = new Date().getTime();

        let body = {
            fields: fields.join(',') + this.getAdditionalFieldsForSearch(),
            UUIDList: UUIDs,
            include_deleted: 1
        };

        let res = await this.papiClient.post(`/${apiResuorce}/search`, body);

        let end = new Date().getTime();

         await this.checkPapiResults(UUIDs, res, apiResuorce);

         console.log(`Update data Index - get data from ${apiResuorce} api took ${end - start} ms. Got ${res.length} rows`);

        return res;
    }


    public async checkPapiResults(UUIDs: string[], res: any, apiResuorce: string) 
    {
        if (UUIDs.length != res.length) {//this is bad - it means the data returned from api search - is not what we expected to get - missing data
            let err = `Update data Index - get data from ${apiResuorce} api return ${res.length} rows and we expected ${UUIDs.length} rows`;
            console.log(`${err}, sending notification using system health`);
            
            const isAsync: boolean = this.client.isAsync!();

            await this.sendAlertToPapiIndexAlertsChannel(apiResuorce, res, UUIDs,isAsync);
            if(!isAsync) 
            {// in the async operation of the PNS I want that if we got some rows these rows will be uploded
            // so we will have somthing untill we will run rebuild or somthing in case of true error 
                throw new Error(err);
            }
        }
    }

    private async sendAlertToPapiIndexAlertsChannel(apiResuorce: string, res: any, UUIDs: string[], isAsync:boolean) {
        let jwt = <any>jwtDecode(this.client.OAuthAccessToken);
        const enviroment = jwt["pepperi.datacenter"];
        const distributorUUID = jwt["pepperi.distributoruuid"];
        const distributor: any = await this.papiClient.get("/distributor");

        let name: string = `<b>${enviroment.toUpperCase()}</b> - Papi Data index PNS Error `;
        let description: string = "Mismatch between PNS modified objects number and the data returned from Papi";
        let message: string = `<b>Distributor:</b> ${distributor["InternalID"]} - ${distributor["Name"]}<br><b>DistUUID:</b> ${distributorUUID}<br><b>ActionUUID:</b> ${this.client.ActionUUID}<br><b>IsAsync operation: </b>${isAsync}
            <br><b style="color:red">ERROR!</b>
            <br>Papi search results on '${apiResuorce}' returned ${res.length} rows while we got ${UUIDs.length} modified objects by PNS. 
            <br>No data was uploaded to data index.<br> Please check!<br>`;

        let kms = await this.papiClient.get("/kms/parameters/papi_data_index_alertsUrl");

        await new SystemHealthService(this.client).sendUserWebhookNotification(name, description, 'ERROR', message, "Always", kms.Value);
    }

    public getRowsToUploadFromApiResult(fieldsToExport: string[], apiResult: any) {
        var rowsToUpload: any[] = [];

        var hiddenFieldExported = fieldsToExport.includes("Hidden");

        apiResult.forEach(apiObject => {
            if (apiObject["Hidden"] != true) { //object to upload to elastic

                if (!hiddenFieldExported) { //remove the hidden field if it not needed to be exported
                    delete apiObject["Hidden"];
                }
                apiObject["Key"] = apiObject["UUID"];// add support to the user of new data index - key is mandatory
                rowsToUpload.push(apiObject);
            }
        });

        console.log(`GetRowsToUploadFromApiResult - got ${rowsToUpload.length} rows`);

        return rowsToUpload;
    }


    async uploadRowsToDataIndex(rowsToUpload: any[], dataIndexType:string) {
        console.log(`uploadRowsToDataIndex - got ${rowsToUpload.length} to upload`);
        var start = new Date().getTime();

        if (rowsToUpload.length > 0) {
            await this.upload(rowsToUpload, dataIndexType);
        }
        var end = new Date().getTime();

        console.log(`Update data Index ${dataIndexType} - upload ${rowsToUpload.length} rows to elasticsearch took ${end - start} ms`);


    }

     private async upload(rowsToUpload: any[],dataIndexType:string) {
        console.log("#####upload####");

        var chunkSize = 500;
        var start = 0;
        var totalRowsCount = rowsToUpload.length;

        while (start < totalRowsCount) {

            var rows = rowsToUpload.slice(start, start + chunkSize);
            var res = await this.papiClient.post(`/addons/shared_index/index/papi_data_index/batch/${this.client.AddonUUID}/${dataIndexType}`, { Objects: rows });
            console.log("batch upload result: "+  JSON.stringify(res))
            start += rows.length;

        }
    }


    async deleteHiddenRowsFromTheDataIndex(UUIDsToDelete: string[],dataIndexType: string) {

        var start = new Date().getTime();

        if (UUIDsToDelete.length > 0) {
            var deleteBody = {
                query: {
                    bool: {
                        must: {
                            terms: {
                                Key: UUIDsToDelete
                            }
                        }
                    }
                }
            };

            var res = await this.papiClient.post(`/addons/shared_index/index/papi_data_index/delete/${this.client.AddonUUID}/${dataIndexType}`, deleteBody);
            

            var end = new Date().getTime();
    
            console.log(`Update data Index ${dataIndexType} - delete ${UUIDsToDelete.length} rows from elasticsearch took ${end - start} ms`);

        }
    }
    
}


