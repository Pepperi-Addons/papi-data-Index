
import { BasePNSAction } from '../BasePNSAction';

export abstract class DataIndexTypeHiddenUpdate extends BasePNSAction {

    abstract handleHiddenRows(hiddenRows: any[]):Promise<any>

    abstract handleUnhideRows(HandleUnhiddenRows: any[],fieldsToExport:string[]):Promise<any>

    async internalExecute(){
        var result: {[k: string]: any} = {};
        result.success=true;
        result.resultObject={};
        // try{
            
            var start = new Date().getTime();
            //Get the data index ADAL record
            var adalRecord = await this.papiClient.addons.data.uuid(this.client.AddonUUID).table("data_index").key(this.dataIndexType).get();
            var rebuildData = adalRecord["RebuildData"];
            if(rebuildData){
                var fieldsToExport : string[] = adalRecord["RebuildData"]["FieldsToExport"];
                if(fieldsToExport)
                {
                    let UUIDs: string[] = this.getFromPnsObjectUUIDsOfRowsWithModifiedHiddenField();
                    //Get from the api all the rows objects by the relevant UUIDs
                    var res = await this.getDataFromApi(UUIDs, fieldsToExport,this.dataIndexType);
                    
                    //Loop on the object we got from the api get
                    //List of object to upload to elastic (without Hidden=0)
                    var hiddenRows : any[] = [];

                    var unhiddenRows : any[] = [];

                    res.forEach(apiObject => {
                        if(apiObject["Hidden"] == true)
                        {//object to upload to elastic
                            hiddenRows.push(apiObject);
                        }
                        else
                        {
                            unhiddenRows.push(apiObject);
                        }
                    });

                    result.resultObject["HandleHideResult"] = await this.handleHiddenRows(hiddenRows);

                    result.resultObject["HandleUnhideResult"] = await this.handleUnhideRows(unhiddenRows, fieldsToExport);
                }
            }
        // }
        // catch(e)
        // {
        //     result.success = false;
        //     result.erroeMessage = e.message;
        // }

        return result;
       
    }




    private getFromPnsObjectUUIDsOfRowsWithModifiedHiddenField():string[] {
        console.log("Getting from the pns object only rows that had update of hidden field");

        let UUIDs: string[] = [];
        this.pnsObjects.forEach(a => {
            const modifiedFields: string[] = a["ModifiedFields"];
            modifiedFields.forEach(modifiedField => {
                if (modifiedField["FieldID"] === "Hidden") {
                    UUIDs.push(a["ObjectKey"]);
                    return;
                }
            });
        });
        return UUIDs;
    }
}