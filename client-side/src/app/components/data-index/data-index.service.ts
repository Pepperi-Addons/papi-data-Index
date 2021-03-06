import jwt from 'jwt-decode';
import { PapiClient } from '@pepperi-addons/papi-sdk';
import { Injectable } from '@angular/core';

import { PepAddonService, PepHttpService, PepDataConvertorService, PepSessionService } from '@pepperi-addons/ngx-lib';

import { PepDialogActionButton, PepDialogData, PepDialogService } from '@pepperi-addons/ngx-lib/dialog';

@Injectable({ providedIn: 'root' })
export class DataIndexService {

    accessToken = '';
    parsedToken: any
    papiBaseURL = ''
    pluginUUID;

    get papiClient(): PapiClient {
        return new PapiClient({
            baseURL: this.papiBaseURL,
            token: this.session.getIdpToken(),
            addonUUID: this.pluginUUID,
            suppressLogging: true
        })
    }

    constructor(
        public addonService: PepAddonService
        , public session: PepSessionService
        , public httpService: PepHttpService
        , public pepperiDataConverter: PepDataConvertorService
        , public dialogService: PepDialogService
    ) {
        const accessToken = this.session.getIdpToken();
        this.parsedToken = jwt(accessToken);
        this.papiBaseURL = this.parsedToken["pepperi.baseurl"]

    }

    ngOnInit(): void { }

    getUIData(successFunc: Function, errorFunc = null) {
        return this.addonService.getAddonApiCall(this.pluginUUID, "data_index_ui_api", "get_ui_data").subscribe(res => successFunc(res), err => errorFunc(err));
    }

    publish(uiData: any, successFunc: Function, errorFunc = null) {
        this.addonService.postAddonApiCall(this.pluginUUID, "data_index_ui_api", "publish", uiData).subscribe(res => successFunc(res), err => errorFunc(err));
    }

    deleteIndex(successFunc: Function, errorFunc = null) {
        this.addonService.postAddonApiCall(this.pluginUUID, "data_index_ui_api", "delete_index").subscribe(res => successFunc(res), err => errorFunc(err));
    }

    openDialog(title: string, content: string, buttonText?: string, confirmCallback?: any, showClose: boolean = true) {
        var actionButtons: PepDialogActionButton[] = []
        if (buttonText)
            actionButtons.push({
                title: buttonText,
                className: "md strong",
                callback: confirmCallback,
            });

        const dialogData = new PepDialogData({
            title: title,
            content: content,
            actionButtons: actionButtons,
            type: "custom",
            showClose: showClose,
        });
        this.dialogService.openDefaultDialog(dialogData);
    }

    openPublishDialog(componentOrTemplateRef: any) {
        return this.dialogService.openDialog(componentOrTemplateRef);
    }

}
