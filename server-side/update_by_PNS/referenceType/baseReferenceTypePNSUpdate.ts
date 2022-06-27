import { AddonData, AddonDataScheme, PapiClient } from '@pepperi-addons/papi-sdk'
import { Client } from '@pepperi-addons/debug-server'
import { CommonMethods } from '../../CommonMethods';
import { BasePNSAction } from '../BasePNSAction';

export class baseReferenceTypePNSUpdate extends BasePNSAction {

    referenceApiType: string;
    

    constructor(inClient: Client, inDataIndexType: string, inPnsObject : any, inReferenceApiType: string) {
        super(inClient,inDataIndexType,inPnsObject);
        this.referenceApiType = inReferenceApiType;
    }

    async internalExecute(){
        var resultObject: {[k: string]: any} = {};
        resultObject.success=true;
        resultObject.resultObject={};
        try
        {
            var start = new Date().getTime();

            //Get the data index ADAL record
            var adalRecord = await this.papiClient.addons.data.uuid(this.client.AddonUUID).table("data_index").key(this.dataIndexType).get();
            var rebuildData = adalRecord["RebuildData"];
            if(rebuildData){
                var fieldsToExport : string[] = adalRecord["RebuildData"]["FieldsToExport"];
                if(fieldsToExport)
                {
                    var referenceTypes = adalRecord["PNSSubscribeData"]["ReferenceTypes"];
                    var referenceTypeData = referenceTypes[this.referenceApiType];
                    if(referenceTypeData)
                    {
                        var prefixesToApiFields  : any = {};
                        var fieldsToGetFromAPI : string[] = [];

                        var referencePrefixesData = referenceTypeData["FieldsData"];

                        var start1 = new Date().getTime();

                        var subscribedFields = CommonMethods.collectFieldsToSubscribeToOnTheApiResource(referencePrefixesData);

                        //collect UUIDs of PNS objects with at least one subscribed fields update
                        var UUIDs = this.collectUUIDsOfPNSObjects(subscribedFields);  

                        this.createPrefixesToApiFieldsDictionary(referencePrefixesData, prefixesToApiFields,referenceTypes);

                        //Get from the api all the rows objects by the relevant UUIDs
                        //an api call to the referenceApiType with all the needed api fields  + UUID + InternalID 
                        //(InternalID because it is reference fields and we have the internalID of the reference exported so we will get the rows by the internalID)  
                        //var apiResults = await this.getDataFromApi(UUIDs,subscribedFields.concat(["InternalID","UUID"]),this.referenceApiType);
                        fieldsToGetFromAPI = this.collectFieldsToGetFromTheAPI(prefixesToApiFields, fieldsToGetFromAPI);

                        var end1 = new Date().getTime();
                        console.log(`Update data Index ${this.dataIndexType} ref type '${this.referenceApiType}' Preparations (collectFieldsToSubscribeTo,collect UUIDs, create prefixes to api dict) took ${end1 - start1} ms`);

                        var apiResults = await this.getDataFromApi(UUIDs,fieldsToGetFromAPI.filter(CommonMethods.distinct),this.referenceApiType);

                        var start2 = new Date().getTime();

                        for (var i=0;i < apiResults.length;i++) {
                            var apiObj = apiResults[i];
                            //loop on the referene obj rows to update the elastic
                            for(var prefix in referencePrefixesData)
                            {
                                await this.updateReferenceRowsByQuery(prefixesToApiFields[prefix],prefix,apiObj);
                            }

                        }

                        var end2 = new Date().getTime();
                        console.log(`Update data Index ${this.dataIndexType}- update by query all reference '${this.referenceApiType}' rows took in total ${end2 - start2} ms`);

                    }
                }
            }

            var end = new Date().getTime();
            console.log(`Update data Index ${this.dataIndexType} reference '${this.referenceApiType}' rows took in total ${end - start} ms`);

        }
        catch(e)
        {
            resultObject.success = false;
            resultObject.erroeMessage = e.message;
        }

        return resultObject;
    }

    
    private collectFieldsToGetFromTheAPI(prefixesToApiFields: any, fieldsToGetFromAPI: string[]) 
    {
        for(var prefix in prefixesToApiFields) 
        {
            fieldsToGetFromAPI = fieldsToGetFromAPI.concat(prefixesToApiFields[prefix]);
        }
        fieldsToGetFromAPI.push("InternalID", "UUID");
        fieldsToGetFromAPI = fieldsToGetFromAPI.filter(CommonMethods.distinct);
        return fieldsToGetFromAPI;
    }

    private createPrefixesToApiFieldsDictionary(referencePrefixesData: any, prefixToApiFields: any,referenceTypes:any) {
        for (var prefix in referencePrefixesData) {
            this.getPrefixToApiFields(referencePrefixesData, prefix, "","", prefixToApiFields,referenceTypes);
        }
    }

    private async updateReferenceRowsByQuery(fields: string[], prefix: string, apiObj: any)
    {
        var fields = fields.filter(CommonMethods.distinct);

        var scriptBody = this.buildScriptSourceStringAndParams(fields, prefix, apiObj);

        var internalIDMatch = {};
        internalIDMatch[`${prefix}.InternalID`] = apiObj["InternalID"];

        if (scriptBody.source) {
            var internalIDMatch = {};
            internalIDMatch[`${prefix}.InternalID`] = apiObj["InternalID"];
            var queryBody = {
                script: scriptBody,
                query: {
                    bool: {
                        must: [
                            { match: internalIDMatch }
                        ]
                    }
                }
            };
            var res = await this.papiClient.post(`/addons/shared_index/index/papi_data_index/update/${this.client.AddonUUID}/${this.dataIndexType}`, queryBody);

            console.log(`Prefix: ${prefix} - Update by query body ${JSON.stringify(queryBody)}`);
            console.log(`Prefix: ${prefix} - Update by query result ${JSON.stringify(res)}`);
        }
    }

    private buildScriptSourceStringAndParams(fields: string[], prefix: string, apiObj: any) {
        //build the source str with the reference fields value
        //now building also params
        var source = "";
        var params = {};
        fields.forEach(field => 
        {
            const exportedName = `${prefix}.${field}`;
            const value = apiObj[field];
            //const valueStr = "" + value;
            params[exportedName] = value;
            const ctxSourceField = `ctx['_source']['${exportedName}']=params['${exportedName}'];`;
            source += ctxSourceField;
        });
        return {source: source, params: params};
    }


    private getPrefixToApiFields(referencePrefixesData: any, prefix: string, refPrefix: string, refRecource:string, prefixToApiFields: any,referenceTypes:any) 
    {
        if(refPrefix)
        {//get the fields from other resource type - e.g. the prefix is Transaction.Agent.Profile 
        //so need to get the fields of the Transaction.Agent.Profile prefix from the profiles recource
            prefixFields = referenceTypes[refRecource]["FieldsData"][refPrefix];
        }
        else
        {
            var prefixFields = referencePrefixesData[prefix];

        }

        if(prefixFields)
        {
            prefixFields.forEach(field => 
                {
                    var fieldPrefix = refPrefix ? refPrefix.replace(`${prefix}.`,'') + "." : "";
                    var fieldName = field["FieldName"];
        
                    var fullFieldName: string = `${fieldPrefix}${fieldName}`;
        
                    if (!field["RefPrefix"]) 
                    {
                        this.InsertToPrefixesFieldDict(prefixToApiFields, prefix, fullFieldName);
                    }
                    else 
                    {
                        fullFieldName = this.getReferenceFullFieldName(fullFieldName, fieldName);
                        this.InsertToPrefixesFieldDict(prefixToApiFields, prefix, fullFieldName);
                        this.getPrefixToApiFields(referencePrefixesData, prefix,field["RefPrefix"],field["RefResource"], prefixToApiFields,referenceTypes);
                    }
        
                });
        }
        
    }

    private getReferenceFullFieldName(fullFieldName: string, fieldName: string) 
    {
        if (!fullFieldName.endsWith(".InternalID")) 
        {
            if (fullFieldName.endsWith("InternalID")) 
            { //e.g AccountInternalID
                var parts = fullFieldName.split("InternalID");
                fullFieldName = `${parts[0]}.InternalID`; // e.g make it Account.InternalID
            }
            else if (fieldName.startsWith("TSA")) 
            { // referenceTSA
                fullFieldName = `${fieldName}.InternalID`; // e.g make it Account.InternalID

            }
        }
        return fullFieldName;
    }

    private InsertToPrefixesFieldDict(prefixToApiFields:any, prefix:string, fieldName:string) {
        if (prefixToApiFields[prefix]) {
            prefixToApiFields[prefix].push(fieldName);
        }
        else {
            prefixToApiFields[prefix] = [fieldName];

        }
    }

    public collectUUIDsOfObjectsWithAtLeastOneSubscribedFieldsUpdate(subscribedFields: string[], UUIDs: string[]) {
        this.pnsObjects.forEach(pnsObject => {

            var updatedFields = pnsObject["ModifiedFields"];

            for (var i = 0; i < updatedFields.length; i++) { //check the fields in pnsObject – if at least one is field we subscribed to (on the SubscribedFields) – save the row UUID on a side list

                if (subscribedFields.includes(updatedFields[i]["FieldID"])) {
                    UUIDs.push(pnsObject["ObjectKey"]);
                    break;
                }
            }
        });
    }
}