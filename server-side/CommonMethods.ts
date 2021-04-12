import { PapiClient } from '@pepperi-addons/papi-sdk'
import { Client} from '@pepperi-addons/debug-server'
export  class CommonMethods{

    public static getPapiClient(client: Client) {
            return new PapiClient({
                baseURL:client.BaseURL,
                token: client.OAuthAccessToken,
                addonUUID: client.AddonUUID,
                addonSecretKey: client.AddonSecretKey
            });
        }

    public static distinct(value, index, self) {
            return self.indexOf(value) === index;
        }

    public static collectFieldsToSubscribeToOnTheApiResource(fieldsData: any) {
        var fieldsToSubscribe: string[] = [];
        for (var prefix in fieldsData) {
            var fieldsObjects = fieldsData[prefix];
            var fields: string[] = fieldsObjects.map(a => a.FieldName);

            if (fieldsToSubscribe.length > 0) {
                fieldsToSubscribe = fieldsToSubscribe.concat(fields);
            }
            else 
            {
                fieldsToSubscribe = fields;
            }
        }
        fieldsToSubscribe = fieldsToSubscribe.filter(CommonMethods.distinct);
            
        return fieldsToSubscribe;
    }

    public static addDefaultFieldsByType(fieldsToExport: string[],dataIndexType:string ) {
        switch (dataIndexType) {
            case "all_activities":
                fieldsToExport.push("InternalID","UUID", "ActivityTypeID", "Status", "ActionDateTime", "Account.ExternalID");
                break;
            case "transaction_lines":
                fieldsToExport.push("InternalID","UUID","Item.ExternalID", "Transaction.Status", "Transaction.ActionDateTime", "Transaction.Account.ExternalID","Transaction.ActivityTypeID");
                break;
        }
        return fieldsToExport;
    }


    public static getAPiResourcesByObjectTypeName(objectTypeName: string):string[] {

        var APiResources:string[] = [];

        switch (objectTypeName) {
            case "Transaction":
                APiResources= ["transactions"]
                break;
            case "Activity":
                APiResources= ["activities"]
                break;
            case "Account":
            case "AdditionalAccount":
            case "OriginAccount":
            case "Account.Parent":
                APiResources= ["accounts"]
                break;
            case "Item":
            case "Item.Parent":
                APiResources= ["items"]
                break;
            case "Creator":
            case "Agent":
                APiResources= ["users","contacts"]
                break;
            case "ContactPerson":
                APiResources= ["contacts"]
                break;
            case "Profile":
                APiResources= ["profiles"]
                break;
            case "Role":
                APiResources= ["roles"]
                break;
            case "Catalog":
                APiResources= ["catalogs"]
                break;
            default: // to support caces where the 
                APiResources = [objectTypeName.toLowerCase()]
                break;
        }
        return APiResources;
    }

    public static async getDataIndexTypeAdalRecord(papiClient: PapiClient,client: Client,dataIndexType:string) 
    {
        return await papiClient.addons.data.uuid(client.AddonUUID).table("data_index").key(dataIndexType).get();
    }

    public static async saveDataIndexTypeAdalRecord(papiClient: PapiClient,client: Client, typeAdalRecord :any) 
    {
        return await papiClient.addons.data.uuid(client.AddonUUID).table("data_index").upsert(typeAdalRecord);
    }

    public static async getDataIndexUIAdalRecord(papiClient: PapiClient,client: Client) 
    {
        return await papiClient.addons.data.uuid(client.AddonUUID).table("data_index_ui").key("meta_data").get();
    }

    public static async  saveDataIndexUIAdalRecord(papiClient: PapiClient,client: Client, uiAdalRecord :any) 
    {
        return await papiClient.addons.data.uuid(client.AddonUUID).table("data_index_ui").upsert(uiAdalRecord);
    }

    public static async getTypesFields(papiClient:PapiClient,resource:string) {
        if(resource == "all_activities")
        {
            var transactionsFields = await papiClient.metaData.type("transactions").fields.get();
            var activitiesFields = await papiClient.metaData.type("activities").fields.get();
            
            return transactionsFields.concat(activitiesFields);
        }
        else
        {
            return await papiClient.metaData.type(resource).fields.get();
        }
    }
}