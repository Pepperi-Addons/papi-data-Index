import { Client } from '@pepperi-addons/debug-server/dist';
import { PapiClient } from '@pepperi-addons/papi-sdk';
import { CommonMethods } from '../../../CommonMethods';


export class TransacionLinesHelper {

    papiClient: PapiClient;


    constructor(papiClient: PapiClient) {
        this.papiClient =papiClient;
    }

public getRowsToUploadFromApiResult(fieldsToExport: string[], apiResult: any) {
        var rowsToUpload: any[] = [];

        var hiddenFieldExported = fieldsToExport.includes("Hidden");
        var transactionHiddenFieldExported = fieldsToExport.includes("Transaction.Hidden");

        apiResult.forEach(apiObject => {
            if (apiObject["Hidden"] != true && apiObject["Transaction.Hidden"] != true) { //object to upload to elastic - cant upload hidden transaction line and cant upload transaction line of hidden  transaction

                if (!hiddenFieldExported && apiObject["Hidden"] !=undefined) { //remove the hidden field if it not needed to be exported
                    delete apiObject["Hidden"];
                }
                if(!transactionHiddenFieldExported && apiObject["Transaction.Hidden"] !=undefined){
                    delete apiObject["Transaction.Hidden"];
                }
                apiObject["Key"] = apiObject["UUID"];// add support to the user of new data index - key is mandatory
                rowsToUpload.push(apiObject);
            }
        });
        return rowsToUpload;
    }

    public async getDataFromApi(UUIDs: string[], fields: string[], apiResuorce : string) {

        var start = new Date().getTime();

        var body = {
            fields: fields.join(',') + ",Hidden,Transaction.Hidden",
            UUIDList: UUIDs,
            include_deleted: 1
        };

        var res = await this.papiClient.post(`/${apiResuorce}/search`, body);

        var end = new Date().getTime();
         console.log(`Update data Index - get data from ${apiResuorce} api rows took ${end - start} ms`);

        return res;
    }

}