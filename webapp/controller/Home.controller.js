sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/m/MessageBox"
], function (Controller, MessageBox) {
  "use strict";

  return Controller.extend("com.incresol.zpaymentworkflow.controller.Home", {

    onInit: function () {
      this._loadUserVerification();
    },

    _loadUserVerification: function () {
      var oODataModel = this.getOwnerComponent().getModel("oModel");
      var oUserVerificationModel = this.getOwnerComponent().getModel("userverification");
      var oRouter = this.getOwnerComponent().getRouter();

      oODataModel.read("/UserApprovalLevelSet", {
        success: function (oData) {

          if (!oData.results || oData.results.length === 0) {
            MessageBox.error("User verification data not found");
            return;
          }

          // 🔹 Take first record
          var oUser = oData.results[0];

          console.log("User verification data loaded:", oUser);

          // 🔹 Save globally
          oUserVerificationModel.setData({
            UserName: oUser.UserName,
            ApprovalLevel: oUser.ApprovalLevel
          });


          // 🔹 Navigation based on ApprovalLevel
          switch (oUser.ApprovalLevel) {

            case "PM":

  // 🔹 Double check user role before navigation
  if (oUser && oUser.ApprovalLevel === "PM") {
      oRouter.navTo("ProjectManager", {}, true);
  } else {
      MessageBox.error("User is not authorized as Project Manager");
  }

  break;
            case "HOD":
              oRouter.navTo("HoAccountsApproval", {}, true);
              break;

            case "CFO":
              oRouter.navTo("CFO", {}, true);
              break;
            case "AUD":
              oRouter.navTo("Auditor", {}, true);
              break;
            case "DIR":
              oRouter.navTo("Director", {}, true);
              break;  

            default:
              MessageBox.error("No navigation configured for approval level: " + oUser.ApprovalLevel);
          }
        },

        error: function (oError) {
          MessageBox.error("Failed to load user verification data");
          console.error(oError);
        }
      }); 
    }

  });
});
