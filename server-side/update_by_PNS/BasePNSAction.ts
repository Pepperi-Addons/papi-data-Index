import { AddonData, AddonDataScheme, PapiClient } from '@pepperi-addons/papi-sdk'
import { Client } from '@pepperi-addons/debug-server'
import { CommonMethods } from '../CommonMethods';
import fetch from "node-fetch";

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

    public async getDataFromApi(UUIDs: string[], fields: string[], apiResuorce : string) {

        var start = new Date().getTime();

        var body = {
            fields: fields.join(',') + ",Hidden",
            UUIDList: UUIDs,
            include_deleted: 1
        };

        var res = await this.papiClient.post(`/${apiResuorce}/search`, body);

        var end = new Date().getTime();
         console.log(`Update data Index - get data from ${apiResuorce} api rows took ${end - start} ms`);

        return res;
    }

    public getRowsToUploadFromApiResult(fieldsToExport: string[], apiResult: any) {
        var rowsToUpload: any[] = [];

        var hiddenFieldExported = fieldsToExport.includes("Hidden");

        apiResult.forEach(apiObject => {
            if (apiObject["Hidden"] != true) { //object to upload to elastic

                if (!hiddenFieldExported) { //remove the hidden field if it not needed to be exported
                    delete apiObject["Hidden"];
                }
                rowsToUpload.push(apiObject);
            }
            apiObject["Key"] = apiObject["UUID"];// add support to the user of new data index - key is mandatory
        });
        return rowsToUpload;
    }


    async uploadRowsToDataIndex(rowsToUpload: any[], dataIndexType:string) {
        
        var start = new Date().getTime();

        if (rowsToUpload.length > 0) {
            await this.upload(rowsToUpload, dataIndexType);
        }
        var end = new Date().getTime();

        console.log(`Update data Index ${dataIndexType} - upload ${rowsToUpload.length} rows to elasticsearch took ${end - start} ms`);


    }

     private async upload(rowsToUpload: any[],dataIndexType:string) {
        //var fileStorage = await this.papiClient.fileStorage.tmp();
        console.log("#####upload####");
        //upload to the url
        // await fetch(fileStorage.UploadURL, {
        //     method: 'PUT',
        //     headers: {'Content-Type': 'application/json',"Cache-Control": "no-cache" },
        //     body: JSON.stringify(rowsToUpload),
        // })

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