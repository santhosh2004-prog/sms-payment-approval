sap.ui.define([
    "sap/ui/core/UIComponent",
    "com/incresol/zpaymentworkflow/model/models",
    "sap/ui/model/json/JSONModel"
], function (UIComponent, models, JSONModel) {
    "use strict";

    return UIComponent.extend("com.incresol.zpaymentworkflow.Component", {
        metadata: {
            manifest: "json",
            interfaces: [
                "sap.ui.core.IAsyncContentCreation"
            ]
        },

        init: function () {
            // call the base component's init function
            UIComponent.prototype.init.apply(this, arguments);

            // set the device model
            this.setModel(models.createDeviceModel(), "device");

            // 🔹 Global User Verification Model
            var oUserVerificationModel = new JSONModel({
                UserName: "",
                Role: ""
            });
            this.setModel(oUserVerificationModel, "userverification");

            // Debug: Check if OData model was created from manifest
            var oModel = this.getModel();
            console.log("Component init - OData model from manifest:", oModel);

            if (oModel) {
                console.log("Model service URL:", oModel.sServiceUrl);
                console.log(
                    "Model metadata state:",
                    oModel.getServiceMetadata() ? "loaded" : "not loaded"
                );
            } else {
                console.warn("No OData model found in component after manifest processing");
            }

            // enable routing
            this.getRouter().initialize();
        }
    });
});
