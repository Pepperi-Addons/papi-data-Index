
import { Client } from '@pepperi-addons/debug-server/dist';
import { DataIndexTypeHiddenUpdate } from './dataIndexTypeHiddenUpdate';

export  class AllActivitiesHiddenUpdate extends DataIndexTypeHiddenUpdate {


    constructor(inClient: Client ,inPnsObject : any) {
        super(inClient,"all_activities",inPnsObject)
    }  

    async handleHiddenRows(hiddenRows: any[]):Promise<any>
    {
        var res:any  = null;
        if(hiddenRows.length > 0)
        {
            //delete the activiy hidden rows
            await this.deleteHiddenRowsFromTheDataIndex(hiddenRows.map(r=>r["UUID"]),"all_activities");

            //delete the transaction lines of the hidden transactions
            var InternalIDsStr = hiddenRows.map(r=>r["InternalID"]).join(",");
            var tlRowsToDelete = await this.papiClient.get(`/transaction_lines?where=Transaction.InternalID in (${InternalIDsStr})&fields=UUID`);
            await this.deleteHiddenRowsFromTheDataIndex(tlRowsToDelete.map(r=>r["UUID"]),"transaction_lines");

            res =  {
                "DeletedActivitiesCount":hiddenRows.length,
                "DeletedTransactionLinesCount":tlRowsToDelete.length
            };
        }

        return res;
    }

    async handleUnhideRows(unhiddenRows: any[],fieldsToExport:string[]):Promise<any>
    {
        var res:any  = null;
        if(unhiddenRows.length > 0)
        {
        //upload unHidden transaction rows
            var rowsToUpload = this.getRowsToUploadFromApiResult(fieldsToExport,unhiddenRows);
            await this.uploadRowsToDataIndex(rowsToUpload,"all_activities");

            //upload transaction lines of unHidden transaction rows
            var InternalIDsStr = unhiddenRows.map(r=>r["InternalID"]).join(",");

            //get transaction lines adal recorde for the transaction lines exported fields
            var tlAdalRecord = await this.papiClient.addons.data.uuid(this.client.AddonUUID).table("data_index").key("transaction_lines").get();
            var tlRowsToUpload:any=[];

            var rebuildData = tlAdalRecord["RebuildData"];
            if(rebuildData)
            {
                var tlFieldsToExport = tlAdalRecord["RebuildData"]["FieldsToExport"];        
                if(tlFieldsToExport)
                {
                    //get from API the transaction lines by the tranasaction internalID (not uuid because we have a partition on Transaction.InternalID)
                    let tlRows = await this.papiClient.get(`/transaction_lines?where=Transaction.InternalID in (${InternalIDsStr})&fields=${tlFieldsToExport.join(",")}`);
                    let tlRowsToUpload = this.getRowsToUploadFromApiResult(tlFieldsToExport,tlRows);
                    await this.uploadRowsToDataIndex(tlRowsToUpload,"transaction_lines");
                }
            }

            res = {
                "InsertedAllActivitiesRowsCount":rowsToUpload.length,
                "InsertedTransactionLinesRowsCount":tlRowsToUpload.length
            }
        }

        return res;

    }

}