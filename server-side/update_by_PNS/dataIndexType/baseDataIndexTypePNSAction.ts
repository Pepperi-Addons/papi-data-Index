import { AddonData} from '@pepperi-addons/papi-sdk'
import { BasePNSAction } from '../BasePNSAction';

export abstract class BaseDataIndexTypePNSAction extends BasePNSAction {

    abstract getUUIDs(pnsObjects: any[],adalRecord: AddonData): string[]


    async internalExecute(){
        var resultObject: {[k: string]: any} = {};
        resultObject.success=true;
        resultObject.resultObject={};
        try{
            
            var start = new Date().getTime();
            //Get the data index ADAL record
            var adalRecord = await this.papiClient.addons.data.uuid(this.client.AddonUUID).table("data_index").key(this.dataIndexType).get();
            var rebuildData = adalRecord["RebuildData"];
            if(rebuildData){
                var fieldsToExport : string[] = adalRecord["RebuildData"]["FieldsToExport"];
                if(fieldsToExport)
                {
                    let UUIDs:string[] = this.getUUIDs(this.pnsObjects, adalRecord);

                    //Get from the api all the rows objects by the relevant UUIDs
                    var res = await this.getDataFromApi(UUIDs, fieldsToExport,this.dataIndexType);
                    //Loop on the object we got from the api getand get a list of object to upload to elastic 
                    var rowsToUpload: any[] = this.getRowsToUploadFromApiResult(fieldsToExport, res);

                    await this.uploadRowsToDataIndex(rowsToUpload,this.dataIndexType);

                    var end = new Date().getTime();

                    resultObject.resultObject = {
                        UploadedRowsCount:rowsToUpload.length
                    }
                    console.log(`Update data Index ${this.dataIndexType} took in total ${end - start} ms, ${JSON.stringify(resultObject.resultObject)}`);

                }
            }
        }catch(e){
            resultObject.success = false;
            resultObject.erroeMessage = e.message;
        }

        return resultObject;

    }

    

}