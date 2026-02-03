sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/ui/core/ValueState",
    "sap/m/MessageBox",
    "sap/ui/core/BusyIndicator"
], function (Controller, JSONModel, MessageToast, ValueState, MessageBox, BusyIndicator) {
    "use strict";

    return Controller.extend("com.incresol.zpaymentworkflow.controller.CFO", {

        onInit: function () {
            console.log("ProjectManager controller initialized");
            
            // Load custom CSS
            this._loadCustomCSS();

            // Initialize view state model for bulk actions and currency display
            var oViewStateModel = new JSONModel({
                showBulkActions: false,
                selectedCount: 0,
                showInLakhs: false // Default to rupees view
            });
            this.getView().setModel(oViewStateModel, "viewState");

            // Initialize tree data model
            var oTreeDataModel = new JSONModel({
                treeData: []
            });
            this.getView().setModel(oTreeDataModel, "treeData");

            // Wait for OData model to be available and load data
            this._waitForModelAndLoadData();
        },

        _loadCustomCSS: function() {
            // Ensure CSS is loaded
            try {
                var sStylePath = sap.ui.require.toUrl("com/incresol/zpaymentworkflow/css/style.css");
                var oLink = document.createElement("link");
                oLink.rel = "stylesheet";
                oLink.type = "text/css";
                oLink.href = sStylePath;
                document.head.appendChild(oLink);
                console.log("Custom CSS loaded from:", sStylePath);
            } catch (e) {
                console.warn("Could not load custom CSS:", e);
                // Fallback: try relative path
                var oLink2 = document.createElement("link");
                oLink2.rel = "stylesheet";
                oLink2.type = "text/css";
                oLink2.href = "./css/style.css";
                document.head.appendChild(oLink2);
            }
        },

        _waitForModelAndLoadData: function () {
            var oModel = this.getView().getModel("oModel");

            if (oModel && oModel.getServiceMetadata()) {
                // Model is ready, load data immediately
                console.log("OData model ready, loading data");
                this._loadPaymentData();
            } else if (oModel) {
                // Model exists but metadata not loaded yet
                console.log("Waiting for OData metadata to load");
                oModel.attachMetadataLoaded(function () {
                    console.log("OData metadata loaded, now loading data");
                    this._loadPaymentData();
                }.bind(this));

                oModel.attachMetadataFailed(function (oEvent) {
                    console.error("OData metadata loading failed:", oEvent.getParameters());
                    MessageToast.show("Failed to load OData metadata");
                });
            } else {
                // Model not available yet, retry after delay
                console.log("OData model not available, retrying in 1 second");
                setTimeout(function () {
                    this._waitForModelAndLoadData();
                }.bind(this), 1000);
            }
        },

        _loadPaymentData: function () {
            var oModel = this.getView().getModel("oModel");

            if (!oModel) {
                MessageToast.show("OData model 'oModel' not available");
                return;
            }

            oModel.read("/PaymentHeaderSet", {
                urlParameters: {
                    "$expand": "ToItems"
                },
                success: function (oData) {
                    console.log("PaymentHeaderSet raw response:", oData);

                    var aHeaders = (oData && oData.results) ? oData.results : [];
                    console.log("Headers count:", aHeaders.length);

                    if (aHeaders.length > 0) {
                        console.log("Sample header:", aHeaders[0]);
                        console.log("Sample header ToItems:", aHeaders[0].ToItems);
                    }

                    if (aHeaders.length === 0) {
                        MessageToast.show("No payment data available");
                        this.getView().getModel("treeData").setData({ treeData: [] });
                        return;
                    }

                    this._transformExpandedHeaderToTree(aHeaders);
                }.bind(this),
                error: function (oError) {
                    console.error("Error loading PaymentHeaderSet with expand:", oError);
                    this.getView().getModel("treeData").setData({ treeData: [] });
                    MessageToast.show("Error loading payment data");
                }.bind(this)
            });
        },

        _transformExpandedHeaderToTree: function (aHeaders) {
            var aTreeData = aHeaders.map(function (oHeader) {
                var aItems = (oHeader.ToItems && oHeader.ToItems.results) ? oHeader.ToItems.results : [];

                return {
                    // ===== Header (backend fields) =====
                    ApprovalNo: oHeader.ApprovalNo,
                    CreatedOn: oHeader.CreatedOn,
                    ProfitCenter: oHeader.ProfitCenter,
                    ProfitCenterName: oHeader.ProfitCenterName,
                    VendorCode: oHeader.VendorCode,
                    VendorName: oHeader.VendorName,
                    CompanyCode: oHeader.CompanyCode,
                    CreatedBy: oHeader.CreatedBy,
                    CreatedAt: oHeader.CreationTime,
                    OverallStatus: oHeader.OverallStatus,

                    // ===== Amounts from backend header =====
                    TotalBaseAmt: oHeader.BaseAmount,
                    TotalGstAmt: oHeader.GSTAmount,
                    TotalTdsAmount: oHeader.TDSAmount,
                    TotalLiability: oHeader.TotalLiability,
                    TotalAmtClaimed: oHeader.AmountClaimed,

                    ItemCount: aItems.length,

                    isHeader: true,
                    displayText: "Approval: " + oHeader.ApprovalNo + " - " + (oHeader.VendorName || ""),
                    Currency: aItems.length > 0 ? aItems[0].Currency : "",

                    // ===== Children =====
                    children: aItems.map(function (oItem) {
                        return Object.assign({}, oItem, {
                            isHeader: false,
                            displayText: "Item " + oItem.ItemNum + " - " + (oItem.VendorName || "")
                        });
                    })
                };
            });

            this.getView().getModel("treeData").setData({ treeData: aTreeData });

            setTimeout(function () {
                var oTreeTable = this.byId("idTreeTable");
                if (oTreeTable && aTreeData.length > 0) {
                    for (var i = 0; i < aTreeData.length; i++) {
                        oTreeTable.expand(i);
                    }
                }
            }.bind(this), 100);
        },

        onSwitchShowInLakhsChange: function (oEvent) {
            var oSwitch = oEvent.getSource();
            var bState = oSwitch.getState();

            // Update the view state model
            var oViewStateModel = this.getView().getModel("viewState");
            oViewStateModel.setProperty("/showInLakhs", bState);

            // Show appropriate message
            var sMessage = bState ? "Amounts now displayed in Lakhs" : "Amounts now displayed in Rupees";
            MessageToast.show(sMessage);
        },

        onTreeTableRowSelectionChange: function (oEvent) {
            var oTable = oEvent.getSource();
            var aSelectedIndices = oTable.getSelectedIndices();
            var oViewStateModel = this.getView().getModel("viewState");

            // Update view state based on selection
            var bHasSelection = aSelectedIndices.length > 0;
            oViewStateModel.setProperty("/showBulkActions", bHasSelection);
            oViewStateModel.setProperty("/selectedCount", aSelectedIndices.length);

            // Add pulse animation to buttons when items are selected
            this._updateButtonAnimations(bHasSelection);

            if (bHasSelection) {
                MessageToast.show(aSelectedIndices.length + " item(s) selected. Use buttons below to approve or reject.");
            }
        },

        _updateButtonAnimations: function(bHasSelection) {
            // Add pulse animation to buttons when items are selected
            setTimeout(function() {
                var aApproveButtons = document.querySelectorAll('.approveButton');
                var aRejectButtons = document.querySelectorAll('.rejectButton');
                
                aApproveButtons.forEach(function(oButton) {
                    if (bHasSelection) {
                        oButton.classList.add('pulse');
                        // Remove pulse after 3 seconds
                        setTimeout(function() {
                            oButton.classList.remove('pulse');
                        }, 3000);
                    } else {
                        oButton.classList.remove('pulse');
                    }
                });
                
                aRejectButtons.forEach(function(oButton) {
                    if (bHasSelection) {
                        oButton.classList.add('pulse');
                        // Remove pulse after 3 seconds
                        setTimeout(function() {
                            oButton.classList.remove('pulse');
                        }, 3000);
                    } else {
                        oButton.classList.remove('pulse');
                    }
                });
            }, 100);
        },

        onApproveButtonPress: function () {
            console.log("=== onApproveButtonPress CALLED ===");
            var oTable = this.byId("idTreeTable");
            var aSelectedIndices = oTable.getSelectedIndices();

            console.log("Selected indices:", aSelectedIndices);

            if (aSelectedIndices.length === 0) {
                MessageToast.show("Please select items to approve");
                return;
            }

            var aSelectedItems = [];
            aSelectedIndices.forEach(function (iIndex) {
                var oContext = oTable.getContextByIndex(iIndex);
                if (oContext) {
                    aSelectedItems.push(oContext.getObject());
                }
            });

            console.log("Selected items for approval:", aSelectedItems);
            console.log("Opening approval dialog with APPROVE action");

            this._openApprovalDialog(aSelectedItems, "APPROVE");
        },
        onRejectButtonPress: function () {
            console.log("=== onRejectButtonPress CALLED ===");
            var oTable = this.byId("idTreeTable");
            var aSelectedIndices = oTable.getSelectedIndices();

            console.log("Selected indices:", aSelectedIndices);

            if (!aSelectedIndices.length) {
                sap.m.MessageToast.show("Please select items to reject");
                return;
            }

            var aSelectedItems = [];
            aSelectedIndices.forEach(function (iIndex) {
                var oContext = oTable.getContextByIndex(iIndex);
                if (oContext) {
                    aSelectedItems.push(oContext.getObject());
                }
            });

            console.log("Selected items for rejection:", aSelectedItems);
            console.log("Opening approval dialog with REJECT action");

            // Open dialog (remarks mandatory)
            this._openApprovalDialog(aSelectedItems, "REJECT");
        },
        _openApprovalDialog: async function (aSelectedItems, sActionType) {
            console.log("=== _openApprovalDialog CALLED ===");
            console.log("Selected Items Count:", aSelectedItems.length);
            console.log("Action Type:", sActionType);
            console.log("Selected Items:", aSelectedItems);

            var sDialogTitle = sActionType === "APPROVE" ? "Approve Items" : "Reject Items";

            // 1) Prepare dialog model data
            var oDialogModel = new sap.ui.model.json.JSONModel({
                title: sDialogTitle,
                actionType: sActionType === "APPROVE" ? "Approve" : "Reject",
                itemCount: aSelectedItems.length,
                selectedItems: aSelectedItems
            });

            console.log("Dialog model data:", oDialogModel.getData());

            // 2) Load fragment once
            if (!this._oApprovalDialog) {
                console.log("Loading approval dialog fragment...");
                this._sDialogFragmentId = this.getView().getId() + "--ApprovalDialog"; // IMPORTANT
                this._oApprovalDialog = await sap.ui.core.Fragment.load({
                    id: this._sDialogFragmentId,
                    name: "com.incresol.zpaymentworkflow.view.ApprovalDialog", // <-- CHANGE to your fragment path
                    controller: this
                });
                this.getView().addDependent(this._oApprovalDialog);
                console.log("Dialog fragment loaded and added as dependent");
            }

            // 3) Set model on dialog (THIS IS THE KEY)
            this._oApprovalDialog.setModel(oDialogModel, "dialogModel");
            console.log("Dialog model set");

            // 4) Store selected items + action in controller for processing
            this._aDialogSelectedItems = aSelectedItems;
            this._sDialogActionType = sActionType;

            console.log("Stored dialog data:");
            console.log("  _aDialogSelectedItems:", this._aDialogSelectedItems);
            console.log("  _sDialogActionType:", this._sDialogActionType);

            // 5) Open
            console.log("Opening dialog...");
            this._oApprovalDialog.open();
            console.log("Dialog opened");
        },


        handleDialogConfirm: function () {
            console.log("=== handleDialogConfirm CALLED ===");

            var sActionType = this._sDialogActionType; // "APPROVE" or "REJECT"
            var aSelectedItems = this._aDialogSelectedItems;

            console.log("Dialog Action Type:", sActionType);
            console.log("Dialog Selected Items:", aSelectedItems);
            console.log("Dialog Selected Items Count:", aSelectedItems ? aSelectedItems.length : 0);

            // For rejection, validate that all selected items have remarks
            if (sActionType === "REJECT") {
                console.log("=== VALIDATING REMARKS FOR REJECTION ===");
                var aItemsWithoutRemarks = [];

                aSelectedItems.forEach(function (oItem) {
                    console.log("Checking item for remarks:", {
                        isHeader: oItem.isHeader,
                        ApprovalNo: oItem.ApprovalNo,
                        PmApprRemarks: oItem.PmApprRemarks
                    });

                    if (!oItem.isHeader && (!oItem.PmApprRemarks || oItem.PmApprRemarks.trim() === "")) {
                        aItemsWithoutRemarks.push(oItem);
                        console.log("  -> Item missing remarks:", oItem);
                    }
                });

                if (aItemsWithoutRemarks.length > 0) {
                    console.log("❌ REJECTION BLOCKED - Missing remarks for " + aItemsWithoutRemarks.length + " items");
                    MessageToast.show("Please enter remarks for all items before rejecting. " +
                        aItemsWithoutRemarks.length + " item(s) missing remarks.");
                    this._oApprovalDialog.close();
                    return;
                }

                console.log("✅ All items have remarks for rejection");
            }

            // Close dialog
            console.log("=== CLOSING DIALOG AND PROCESSING BULK ACTION ===");
            this._oApprovalDialog.close();

            // Call your existing bulk process method
            console.log("=== CALLING _processBulkAction ===");
            this._processBulkAction(this._aDialogSelectedItems, sActionType);
        },


        handleDialogCancel: function () {
            console.log("=== handleDialogCancel CALLED ===");
            if (this._oApprovalDialog) {
                this._oApprovalDialog.close();
            }
        },

        onDialogAfterClose: function () {
            console.log("=== onDialogAfterClose CALLED ===");
            // Optional cleanup - dialog closed
        },

        onTdsAmountChange: function (oEvent) {
            var oInput = oEvent.getSource();
            var oContext = oInput.getBindingContext("treeData");
            var sNewValue = oEvent.getParameter("value");

            // Validate numeric input
            var fNewValue = parseFloat(sNewValue) || 0;
            if (fNewValue < 0) {
                fNewValue = 0;
                oInput.setValue(fNewValue.toFixed(2));
                MessageToast.show("TDS Amount cannot be negative");
                return;
            }

            // Format to 2 decimal places
            var sFormattedValue = fNewValue.toFixed(2);
            oInput.setValue(sFormattedValue);

            // Update the tree data model
            oContext.getModel().setProperty(oContext.getPath() + "/TdsAmount", sFormattedValue);

            console.log("TDS Amount updated in tree data model:", sFormattedValue);
            MessageToast.show("TDS Amount updated to ₹" + fNewValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
        },

        onPmApprAmountChange: function (oEvent) {
            var oInput = oEvent.getSource();
            var oContext = oInput.getBindingContext("treeData");
            var sNewValue = oEvent.getParameter("value");

            // Validate numeric input
            var fNewValue = parseFloat(sNewValue) || 0;
            if (fNewValue < 0) {
                fNewValue = 0;
                oInput.setValue(fNewValue.toFixed(2));
                MessageToast.show("PM Approved Amount cannot be negative");
                return;
            }

            // Format to 2 decimal places
            var sFormattedValue = fNewValue.toFixed(2);
            oInput.setValue(sFormattedValue);

            // Update the tree data model
            oContext.getModel().setProperty(oContext.getPath() + "/PmApprAmt", sFormattedValue);

            console.log("PM Approved Amount updated in tree data model:", sFormattedValue);
            MessageToast.show("PM Approved Amount updated to ₹" + fNewValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
        },

        onRemarksChange: function (oEvent) {
            var oInput = oEvent.getSource();
            var oContext = oInput.getBindingContext("treeData");
            var sNewValue = oEvent.getParameter("value");

            // Update the tree data model
            oContext.getModel().setProperty(oContext.getPath() + "/PmApprRemarks", sNewValue);

            console.log("PM Remarks updated in tree data model:", sNewValue);
        },

        _processBulkAction: function (aSelectedItems, sActionType) {
            console.log("=== _processBulkAction CALLED ===");
            console.log("Selected Items Count:", aSelectedItems.length);
            console.log("Action Type:", sActionType);
            console.log("Selected Items:", aSelectedItems);

            var oTreeModel = this.getView().getModel("treeData");
            var aTreeData = oTreeModel.getData().treeData;
            var sStatus = sActionType === "APPROVE" ? "APPROVED" : "REJECTED";
            var sDefaultRemarks = sActionType === "APPROVE" ? "Approved via bulk action" : "Rejected via bulk action";

            // Prepare payload with all line item details
            var aPayloadItems = [];

            console.log("=== BUILDING PAYLOAD ITEMS ===");

            aSelectedItems.forEach(function (oSelectedItem, iIndex) {
                console.log("Processing selected item " + (iIndex + 1) + ":", oSelectedItem);

                if (!oSelectedItem.isHeader) {
                    // Individual item selected
                    console.log("  -> Individual item selected");
                    var oPayloadItem = this._createPayloadItem(oSelectedItem, sStatus, sDefaultRemarks);
                    aPayloadItems.push(oPayloadItem);
                    console.log("  -> Payload item created:", oPayloadItem);
                } else {
                    // Header selected - include all its children
                    console.log("  -> Header selected, processing children");
                    var oHeader = this._findHeaderInTreeData(aTreeData, oSelectedItem.ApprovalNo);
                    if (oHeader && oHeader.children) {
                        console.log("  -> Found header with " + oHeader.children.length + " children");
                        oHeader.children.forEach(function (oChildItem, iChildIndex) {
                            console.log("    -> Processing child " + (iChildIndex + 1) + ":", oChildItem);
                            var oPayloadItem = this._createPayloadItem(oChildItem, sStatus, sDefaultRemarks);
                            aPayloadItems.push(oPayloadItem);
                            console.log("    -> Child payload item created:", oPayloadItem);
                        }.bind(this));
                    } else {
                        console.log("  -> No header found or no children");
                    }
                }
            }.bind(this));

            console.log("=== FINAL PAYLOAD ITEMS ===");
            console.log("Total payload items:", aPayloadItems.length);
            console.log("Payload items array:", aPayloadItems);

            if (aPayloadItems.length === 0) {
                console.error("❌ NO PAYLOAD ITEMS CREATED!");
                MessageToast.show("No items to process");
                return;
            }

            // Send payload to backend
            console.log("=== CALLING _sendApprovalPayloadToBackend ===");
            //this._sendApprovalPayloadToBackend(aPayloadItems, sActionType, aSelectedItems);
            this._sendDeepApprovalPayload(aPayloadItems, sActionType);
        },
_sendDeepApprovalPayload: function (aPayloadItems, sActionType) {
    var oModel = this.getView().getModel("oModel");

    if (!oModel || !Array.isArray(aPayloadItems) || aPayloadItems.length === 0) {
        sap.m.MessageToast.show("No data to send");
        return;
    }

    /* ================= HELPERS ================= */

    var dec = function (v) {
        return (v !== undefined && v !== null && v !== "")
            ? Number(v).toFixed(2)
            : "0.00";
    };

    // SAP Gateway Edm.DateTime (V2)
    var toEdmDateTime = function (v) {
        if (!v) return null;
        var d = new Date(v);
        return isNaN(d.getTime()) ? null : "/Date(" + d.getTime() + ")/";
    };

    /* ================= HEADER ================= */

    var oFirst = aPayloadItems[0];
    var sApprovalNo = String(oFirst.ApprovalNo).trim();
    var sVendorCode = String(oFirst.VendorCode || oFirst.VendorNumber).trim();

    var oDeepPayload = {
        ApprovalNo: sApprovalNo,
        CreatedOn: null,
        ProfitCenter: oFirst.ProfitCenter || "",
        ProfitCenterName: oFirst.ProfitCenterName || "",
        VendorCode: sVendorCode,
        VendorName: oFirst.VendorName || "",
        CompanyCode: oFirst.CompanyCode || "",
        CreatedBy: "",
        CreationTime: "PT00H00M00S",

        OverallStatus: "CFO_APPR",

        GrossAmount: dec(oFirst.GrossAmount),
        BaseAmount: dec(oFirst.BaseAmount),
        GSTAmount: dec(oFirst.GSTAmount),
        TDSAmount: dec(oFirst.TDSAmount),
        TotalLiability: dec(oFirst.TotalLiability),
        GST2AReflected: dec(oFirst.GST2AReflected),
        GST2ANotReflected: dec(oFirst.GST2ANotReflected),
        AmountClaimed: dec(oFirst.AmountClaimed),
        ProposedAmount: dec(oFirst.ProposedAmount),

        PMApprovedAmount: dec(oFirst.PMApprovedAmount),
        HODApprovedAmount: dec(oFirst.HODApprovedAmount),
        CFOApprovedAmount: dec(oFirst.CFOApprovedAmount),
        AuditorApprovedAmount: dec(oFirst.AuditorApprovedAmount),
        DirectorApprovedAmount: dec(oFirst.DirectorApprovedAmount),

        /* ================= ITEMS ================= */

        ToItems: {
            results: aPayloadItems.map(function (oItem) {
                return {
                    ApprovalNo: sApprovalNo,
                    ProfitCenter: oItem.ProfitCenter || "",
                    TaxNum: oItem.TaxNum || "",
                    ProfitCenterName: oItem.ProfitCenterName || "",
                    BankKey: oItem.BankKey || "",
                    VendorCode: sVendorCode,
                    VendorName: oItem.VendorName || "",
                    DocNum: oItem.DocNum || "",
                    ItemNum: String(oItem.ItemNum),
                    LiabHead: oItem.LiabHead || "",
                    ReferenceDoc: oItem.ReferenceDoc || "",
                    PurchDoc: oItem.PurchDoc || "",

                    DocDate: toEdmDateTime(oItem.DocDate),
                    PostingDt: toEdmDateTime(oItem.PostingDt),

                    GrossAmt: dec(oItem.GrossAmt),
                    BaseAmt: dec(oItem.BaseAmt),
                    GstAmt: dec(oItem.GstAmt),
                    TdsAmount: dec(oItem.TdsAmount),
                    TotalLiability: dec(oItem.TotalLiability),

                    Gst2aRef: dec(oItem.Gst2aRef),
                    Gst2aNref: dec(oItem.Gst2aNref),
                    AmtClaimed: dec(oItem.AmtClaimed),
                    AprnoRef: oItem.AprnoRef || "",
                    ProposedAmt: dec(oItem.ProposedAmt),

                    Currency: oItem.Currency || "",
                    Gstr1Details: oItem.Gstr1Details || "",
                    Remark: oItem.Remark || "",

                    AccountHolder: oItem.AccountHolder || "",
                    AccountNumber: oItem.AccountNumber || "",
                    BankName: oItem.BankName || "",
                    Branch: oItem.Branch || "",

                    /* ===== PM ===== */
                    PmApprAmt: dec(oItem.PmApprAmt),
                    PmUserId: oItem.PmUserId || "",
                    PmApprStatus: oItem.PmApprStatus || "",
                    PmApprOn: toEdmDateTime(oItem.PmApprOn),
                    PmApprRemarks: oItem.PmApprRemarks || "",

                    /* ===== HOD ===== */
                    HodApprAmt: dec(oItem.HodApprAmt),
                    HodUserId: "",
                    HodApprStatus: "",
                    HodApprOn: null,
                    HodApprRemarks: "",

                    /* ===== CFO ===== */
                    CfoApprAmt: "0.00",
                    CfoUserId: "",
                    CfoApprStatus: "",
                    CfoApprOn: null,
                    CfoApprRemarks: "",

                    /* ===== AUDITOR ===== */
                    AudApprAmt: "0.00",
                    AudUserId: "",
                    AudApprStatus: "",
                    AudApprOn: null,
                    AudApprRemarks: "",

                    /* ===== DIRECTOR ===== */
                    DirApprAmt: "0.00",
                    DirUserId: "",
                    DirApprStatus: "",
                    DirApprOn: null,
                    DirApprRemarks: "",

                    ModeOfPayment: "",
                    UtrNo: "",
                    PaidAmount1: "0.00",
                    PaymentDate1: null,
                    PaidAmount2: "0.00",
                    PaymentDate2: null,
                    TotalBalOut: "0.00",
                    BalancePayable: "0.00"
                };
            })
        }
    };

    console.log("🚀 FINAL DEEP CREATE PAYLOAD (MATCHED)");
    console.log(JSON.stringify(oDeepPayload, null, 2));

    sap.ui.core.BusyIndicator.show(0);

    oModel.create("/PaymentHeaderSet", oDeepPayload, {
        success: function () {
            sap.ui.core.BusyIndicator.hide();
            sap.m.MessageToast.show("Approval sent successfully");
        },
        error: function (oError) {
            sap.ui.core.BusyIndicator.hide();
            console.error("❌ Deep create failed", oError);
            sap.m.MessageBox.error("Backend update failed");
        }
    });
}


,



        _createPayloadItem: function (oItem, sStatus, sDefaultRemarks) {
            console.log("=== _createPayloadItem CALLED ===");
            console.log("Input Item:", oItem);
            console.log("Status:", sStatus);
            console.log("Default Remarks:", sDefaultRemarks);

            var sCurrentUser = this._getCurrentUserId();

            // Ensure required key fields are properly formatted
            var sApprovalNo = (oItem.ApprovalNo || "").toString().trim();
            var sVendorCode = (oItem.VendorCode || oItem.VendorNumber || "").toString().trim();

            console.log("Key Fields Check:");
            console.log("  ApprovalNo:", sApprovalNo);
            console.log("  VendorCode:", sVendorCode);
            console.log("  Current User:", sCurrentUser);

            if (!sApprovalNo || !sVendorCode) {
                console.warn("❌ Missing required key fields for payload item:", {
                    ApprovalNo: sApprovalNo,
                    VendorCode: sVendorCode,
                    Item: oItem
                });
            }

            var oPayloadItem = {
                // Key fields (required for OData operations)
                ApprovalNo: sApprovalNo,
                VendorCode: sVendorCode,
                VendorNumber: sVendorCode, // Alias for compatibility
                ProfitCenterName: (oItem.ProfitCenterName || "").toString(),
                ProfitCenter: (oItem.ProfitCenter || "").toString(),
                // Other fields
                ItemNum: (oItem.ItemNum || "").toString(),
                VendorName: (oItem.VendorName || "").toString(),
                DocNum: (oItem.DocNum || "").toString(),
                LiabHead: (oItem.LiabHead || "").toString(),
                PurchDoc: (oItem.PurchDoc || "").toString(),
                DocDate: oItem.DocDate,
                PostingDt: oItem.PostingDt,
                BaseAmt: (parseFloat(oItem.BaseAmt || 0)).toString(),
                GstAmt: (parseFloat(oItem.GstAmt || 0)).toString(),
                TdsAmount: (parseFloat(oItem.TdsAmount || 0)).toString(),
                TotalLiability: (parseFloat(oItem.TotalLiability || 0)).toString(),
                AmtClaimed: (parseFloat(oItem.AmtClaimed || 0)).toString(),
                PmApprAmt: (parseFloat(oItem.PmApprAmt || 0)).toString(),
                PmApprStatus: sStatus,
                PmApprRemarks: (oItem.PmApprRemarks || sDefaultRemarks || "").toString(),
                PmApprOn: new Date().toISOString(),
                PmUserId: sCurrentUser,
                Currency: (oItem.Currency || "INR").toString(),
                AccountNumber: (oItem.AccountNumber || "").toString(),
                BankName: (oItem.BankName || "").toString(),
                // Include other fields with safe defaults
                TaxNum: (oItem.TaxNum || "").toString(),
                BankKey: (oItem.BankKey || "").toString(),
                ReferenceDoc: (oItem.ReferenceDoc || "").toString(),
                Gst2aRef: (parseFloat(oItem.Gst2aRef || 0)).toString(),
                Gst2aNref: (parseFloat(oItem.Gst2aNref || 0)).toString(),
                AprnoRef: (oItem.AprnoRef || "").toString(),
                Gstr1Details: (oItem.Gstr1Details || "").toString(),
                Remark: (oItem.Remark || "").toString(),
                AccountHolder: (oItem.AccountHolder || "").toString(),
                Branch: (oItem.Branch || "").toString()
            };

            console.log("=== COMPLETE PAYLOAD ITEM CREATED ===");
            console.log("Payload Item Details:");
            console.log("  ApprovalNo:", oPayloadItem.ApprovalNo);
            console.log("  VendorCode:", oPayloadItem.VendorCode);
            console.log("  ItemNum:", oPayloadItem.ItemNum);
            console.log("  VendorName:", oPayloadItem.VendorName);
            console.log("  DocNum:", oPayloadItem.DocNum);
            console.log("  LiabHead:", oPayloadItem.LiabHead);
            console.log("  PurchDoc:", oPayloadItem.PurchDoc);
            console.log("  DocDate:", oPayloadItem.DocDate);
            console.log("  PostingDt:", oPayloadItem.PostingDt);
            console.log("  BaseAmt:", oPayloadItem.BaseAmt);
            console.log("  GstAmt:", oPayloadItem.GstAmt);
            console.log("  TdsAmount:", oPayloadItem.TdsAmount);
            console.log("  TotalLiability:", oPayloadItem.TotalLiability);
            console.log("  AmtClaimed:", oPayloadItem.AmtClaimed);
            console.log("  PmApprAmt:", oPayloadItem.PmApprAmt);
            console.log("  PmApprStatus:", oPayloadItem.PmApprStatus);
            console.log("  PmApprRemarks:", oPayloadItem.PmApprRemarks);
            console.log("  PmApprOn:", oPayloadItem.PmApprOn);
            console.log("  PmUserId:", oPayloadItem.PmUserId);
            console.log("  Currency:", oPayloadItem.Currency);
            console.log("  AccountNumber:", oPayloadItem.AccountNumber);
            console.log("  BankName:", oPayloadItem.BankName);
            console.log("  TaxNum:", oPayloadItem.TaxNum);
            console.log("  BankKey:", oPayloadItem.BankKey);
            console.log("  ReferenceDoc:", oPayloadItem.ReferenceDoc);
            console.log("  Gst2aRef:", oPayloadItem.Gst2aRef);
            console.log("  Gst2aNref:", oPayloadItem.Gst2aNref);
            console.log("  AprnoRef:", oPayloadItem.AprnoRef);
            console.log("  Gstr1Details:", oPayloadItem.Gstr1Details);
            console.log("  Remark:", oPayloadItem.Remark);
            console.log("  AccountHolder:", oPayloadItem.AccountHolder);
            console.log("  Branch:", oPayloadItem.Branch);
            console.log("=== FULL PAYLOAD ITEM (JSON) ===");
            console.log(JSON.stringify(oPayloadItem, null, 2));
            console.log("=== USER REQUESTED PAYLOAD FORMAT ===");
            console.log("ItemNum:", oPayloadItem.ItemNum);
            console.log("VendorName:", oPayloadItem.VendorName);
            console.log("DocNum:", oPayloadItem.DocNum);
            console.log("LiabHead:", oPayloadItem.LiabHead);
            console.log("PurchDoc:", oPayloadItem.PurchDoc);
            console.log("DocDate:", oPayloadItem.DocDate);
            console.log("PostingDt:", oPayloadItem.PostingDt);
            console.log("BaseAmt:", oPayloadItem.BaseAmt);
            console.log("GstAmt:", oPayloadItem.GstAmt);
            console.log("TdsAmount:", oPayloadItem.TdsAmount);
            console.log("TotalLiability:", oPayloadItem.TotalLiability);
            console.log("AmtClaimed:", oPayloadItem.AmtClaimed);
            console.log("PmApprAmt:", oPayloadItem.PmApprAmt);
            console.log("PmApprStatus:", oPayloadItem.PmApprStatus);
            console.log("PmApprRemarks:", oPayloadItem.PmApprRemarks);
            console.log("PmApprOn:", oPayloadItem.PmApprOn);
            console.log("PmUserId:", oPayloadItem.PmUserId);
            console.log("Currency:", oPayloadItem.Currency);
            console.log("AccountNumber:", oPayloadItem.AccountNumber);
            console.log("BankName:", oPayloadItem.BankName);
            console.log("TaxNum:", oPayloadItem.TaxNum);
            console.log("BankKey:", oPayloadItem.BankKey);
            console.log("ReferenceDoc:", oPayloadItem.ReferenceDoc);
            console.log("Gst2aRef:", oPayloadItem.Gst2aRef);
            console.log("Gst2aNref:", oPayloadItem.Gst2aNref);
            console.log("AprnoRef:", oPayloadItem.AprnoRef);
            console.log("Gstr1Details:", oPayloadItem.Gstr1Details);
            console.log("Remark:", oPayloadItem.Remark);
            console.log("AccountHolder:", oPayloadItem.AccountHolder);
            console.log("Branch:", oPayloadItem.Branch);
            console.log("===============================");

            return oPayloadItem;
        },

        _getCurrentUserId: function () {
            // Try to get current user from various sources
            try {
                // Option 1: From shell service (if available)
                if (sap.ushell && sap.ushell.Container) {
                    var oUser = sap.ushell.Container.getService("UserInfo").getUser();
                    if (oUser && oUser.getId) {
                        return oUser.getId();
                    }
                }

                // Option 2: From OData model user context (if available)
                var oModel = this.getView().getModel("oModel");
                if (oModel && oModel.getCurrentUser) {
                    return oModel.getCurrentUser();
                }

                // Option 3: Default fallback
                return "CURRENT_USER";
            } catch (e) {
                console.log("Could not determine current user, using default");
                return "CURRENT_USER";
            }
        },

        // Test method to verify payload structure (for debugging)
        _testPayloadStructure: function () {
            var oTreeModel = this.getView().getModel("treeData");
            var aTreeData = oTreeModel.getData().treeData;

            if (aTreeData.length > 0 && aTreeData[0].children && aTreeData[0].children.length > 0) {
                var oTestItem = aTreeData[0].children[0];
                var oPayloadItem = this._createPayloadItem(oTestItem, "APPROVED", "Test approval");

                console.log("=== TEST PAYLOAD STRUCTURE ===");
                console.log("Sample Item:", oTestItem);
                console.log("Generated Payload:", oPayloadItem);
                console.log("OData Path would be:", "/PaymentItemSet(ApprovalNo='" + oPayloadItem.ApprovalNo + "',VendorCode='" + oPayloadItem.VendorCode + "')");
                console.log("Key Fields Check:", {
                    ApprovalNo: oPayloadItem.ApprovalNo,
                    VendorCode: oPayloadItem.VendorCode,
                    Valid: !!(oPayloadItem.ApprovalNo && oPayloadItem.VendorCode)
                });
                console.log("==============================");

                return oPayloadItem;
            }

            return null;
        },

        // Test method to simulate approval flow (for debugging)
        testApprovalFlow: function () {
            console.log("=== TESTING APPROVAL FLOW ===");

            var oTreeModel = this.getView().getModel("treeData");
            var aTreeData = oTreeModel.getData().treeData;

            if (aTreeData.length > 0 && aTreeData[0].children && aTreeData[0].children.length > 0) {
                var aTestItems = [aTreeData[0].children[0]]; // First child item

                console.log("Test items:", aTestItems);
                console.log("Calling _processBulkAction with test data...");

                this._processBulkAction(aTestItems, "APPROVE");
            } else {
                console.log("No test data available");
            }
        },

        // Test payload creation without backend call
        testPayloadCreation: function () {
            console.log("=== TESTING PAYLOAD CREATION ONLY ===");

            var oModel = this.getView().getModel("oModel");

            if (!oModel) {
                console.log("OData model not available");
                return null;
            }

            // Try to get first item from OData model
            oModel.read("/PaymentItemSet", {
                urlParameters: {
                    "$top": "1"
                },
                success: function (oData) {
                    if (oData.results && oData.results.length > 0) {
                        var oTestItem = oData.results[0];

                        console.log("=== TESTING WITH FIRST AVAILABLE ITEM ===");
                        console.log("Original Item:", oTestItem);

                        // Test payload creation for APPROVE
                        console.log("\n=== TESTING APPROVE PAYLOAD ===");
                        var oApprovePayload = this._createPayloadItem(oTestItem, "APPROVED", "Test approval");

                        // Test payload creation for REJECT
                        console.log("\n=== TESTING REJECT PAYLOAD ===");
                        var oRejectPayload = this._createPayloadItem(oTestItem, "REJECTED", "Test rejection");

                        console.log("=== PAYLOAD CREATION TEST COMPLETE ===");

                        return {
                            originalItem: oTestItem,
                            approvePayload: oApprovePayload,
                            rejectPayload: oRejectPayload
                        };
                    } else {
                        console.log("No test data available from backend");
                        return null;
                    }
                }.bind(this),
                error: function (oError) {
                    console.error("Failed to load test data:", oError);
                    return null;
                }
            });
        },

        // Test backend connection without payload
        testBackendConnection: function () {
            console.log("=== TESTING BACKEND CONNECTION ===");

            var oModel = this.getView().getModel("oModel");

            if (!oModel) {
                console.error("❌ OData model not available");
                return;
            }

            console.log("✅ OData model available");
            console.log("Service URL:", oModel.sServiceUrl);
            console.log("Metadata loaded:", !!oModel.getServiceMetadata());

            // Check what entity sets are available
            this._checkAvailableEntitySets();

            // Try a simple read operation to test connection
            console.log("Testing connection with PaymentItemSet read...");

            oModel.read("/PaymentItemSet", {
                urlParameters: {
                    "$top": "1"
                },
                success: function (oData) {
                    console.log("✅ Backend connection successful");
                    console.log("Sample data received:", oData);
                },
                error: function (oError) {
                    console.error("❌ Backend connection failed");
                    console.error("Error:", oError);
                }
            });
        },

        _loadMockData: function () {
            console.log("Loading mock data for testing...");

            // Create mock payment items data
            var aMockItems = [
                {
                    ApprovalNo: "0000000001",
                    VendorCode: "10000001",
                    VendorName: "Test Vendor 1",
                    ItemNum: "001",
                    DocNum: "DOC001",
                    LiabHead: "UTILITIES",
                    PurchDoc: "PO001",
                    DocDate: new Date("2024-01-15"),
                    PostingDt: new Date("2024-01-16"),
                    BaseAmt: "10000.00",
                    GstAmt: "1800.00",
                    TdsAmount: "200.00",
                    TotalLiability: "11600.00",
                    AmtClaimed: "11600.00",
                    PmApprAmt: "0.00",
                    PmApprStatus: "PENDING",
                    PmApprRemarks: "",
                    Currency: "INR",
                    BankName: "Test Bank 1",
                    AccountNumber: "123456789",
                    Gst2aRef: "1800.00",
                    Gst2aNref: "0.00",
                    AprnoRef: "",
                    ProposedAmt: "11600.00"
                },
                {
                    ApprovalNo: "0000000001",
                    VendorCode: "10000002",
                    VendorName: "Test Vendor 2",
                    ItemNum: "002",
                    DocNum: "DOC002",
                    LiabHead: "MAINTENANCE",
                    PurchDoc: "PO002",
                    DocDate: new Date("2024-01-17"),
                    PostingDt: new Date("2024-01-18"),
                    BaseAmt: "15000.00",
                    GstAmt: "2700.00",
                    TdsAmount: "300.00",
                    TotalLiability: "17400.00",
                    AmtClaimed: "17400.00",
                    PmApprAmt: "0.00",
                    PmApprStatus: "PENDING",
                    PmApprRemarks: "",
                    Currency: "INR",
                    BankName: "Test Bank 2",
                    AccountNumber: "987654321",
                    Gst2aRef: "2700.00",
                    Gst2aNref: "0.00",
                    AprnoRef: "",
                    ProposedAmt: "17400.00"
                },
                {
                    ApprovalNo: "0000000002",
                    VendorCode: "10000003",
                    VendorName: "Test Vendor 3",
                    ItemNum: "001",
                    DocNum: "DOC003",
                    LiabHead: "SUPPLIES",
                    PurchDoc: "PO003",
                    DocDate: new Date("2024-01-20"),
                    PostingDt: new Date("2024-01-21"),
                    BaseAmt: "8000.00",
                    GstAmt: "1440.00",
                    TdsAmount: "160.00",
                    TotalLiability: "9280.00",
                    AmtClaimed: "9280.00",
                    PmApprAmt: "0.00",
                    PmApprStatus: "PENDING",
                    PmApprRemarks: "",
                    Currency: "INR",
                    BankName: "Test Bank 3",
                    AccountNumber: "456789123",
                    Gst2aRef: "1440.00",
                    Gst2aNref: "0.00",
                    AprnoRef: "",
                    ProposedAmt: "9280.00"
                }
            ];

            console.log("Mock data created:", aMockItems.length, "items");

            // Create the items model with mock data
            var oItemsModel = new JSONModel({
                items: aMockItems
            });
            this.getView().setModel(oItemsModel, "itemsModel");

            MessageToast.show("Loaded " + aMockItems.length + " mock payment items for testing");
            console.log("Mock data loaded successfully");
        },
        // Manual function to test service connection
        testServiceConnection: function () {
            console.log("=== MANUAL SERVICE CONNECTION TEST ===");

            var oModel = this.getView().getModel("oModel");

            if (!oModel) {
                console.error("❌ OData model not available");
                MessageToast.show("OData model not available");
                return;
            }

            console.log("Service URL:", oModel.sServiceUrl);
            console.log("Full URL:", window.location.origin + oModel.sServiceUrl);

            // Test metadata first
            console.log("Testing metadata...");
            var oMetadata = oModel.getServiceMetadata();
            console.log("Metadata available:", !!oMetadata);

            if (!oMetadata) {
                console.log("Forcing metadata load...");
                oModel.refreshMetadata();

                setTimeout(function () {
                    var oNewMetadata = oModel.getServiceMetadata();
                    console.log("Metadata after refresh:", !!oNewMetadata);

                    if (!oNewMetadata) {
                        console.log("❌ Metadata still not available, service might be down");
                        MessageToast.show("Service appears to be unavailable");
                    } else {
                        console.log("✅ Metadata loaded, trying data...");
                        this._loadPaymentData();
                    }
                }.bind(this), 3000);
            } else {
                console.log("✅ Metadata available, trying data...");
                this._loadPaymentData();
            }
        },

        // Force load mock data for testing
        loadMockData: function () {
            console.log("=== FORCING MOCK DATA LOAD ===");
            this._loadMockData();
        },

        testDataAvailability: function () {
            console.log("=== TESTING DATA AVAILABILITY ===");

            var oModel = this.getView().getModel("oModel");

            if (!oModel) {
                console.error("❌ OData model not available");
                return;
            }

            // Check metadata first
            this._checkAvailableEntitySets();

            // Test all possible entity sets
            var aEntitySetsToTest = [
                "/PaymentItemSet",
                "/PaymentHeaderSet",
                "/$metadata"
            ];

            aEntitySetsToTest.forEach(function (sEntitySet) {
                console.log("Testing: " + sEntitySet);

                if (sEntitySet === "/$metadata") {
                    // Special handling for metadata
                    var oMetadata = oModel.getServiceMetadata();
                    console.log("  Metadata available:", !!oMetadata);
                    return;
                }

                oModel.read(sEntitySet, {
                    urlParameters: {
                        "$top": "3"
                    },
                    success: function (oData) {
                        console.log("  ✅ " + sEntitySet + " - Success");
                        console.log("    Count:", oData.results ? oData.results.length : 0);
                        if (oData.results && oData.results.length > 0) {
                            console.log("    Sample:", oData.results[0]);
                        }
                    },
                    error: function (oError) {
                        console.error("  ❌ " + sEntitySet + " - Failed:", oError.message);
                    }
                });
            });

            console.log("=================================");
        },

        _checkAvailableEntitySets: function () {
            var oModel = this.getView().getModel("oModel");
            var oMetadata = oModel.getServiceMetadata();

            console.log("=== AVAILABLE ENTITY SETS ===");

            if (oMetadata && oMetadata.dataServices && oMetadata.dataServices.schema) {
                oMetadata.dataServices.schema.forEach(function (oSchema) {
                    if (oSchema.entityContainer && oSchema.entityContainer[0] && oSchema.entityContainer[0].entitySet) {
                        console.log("Entity Sets found:");
                        oSchema.entityContainer[0].entitySet.forEach(function (oEntitySet) {
                            console.log("  - " + oEntitySet.name + " (Type: " + oEntitySet.entityType + ")");
                        });
                    }
                });
            } else {
                console.log("No metadata available or metadata structure unexpected");
            }

            console.log("===============================");
        },

        // Debug method to check data structure
        _debugDataStructure: function () {
            var oTreeModel = this.getView().getModel("treeData");
            var aTreeData = oTreeModel.getData().treeData;

            console.log("=== DATA STRUCTURE DEBUG ===");
            console.log("Tree Data Count:", aTreeData.length);

            if (aTreeData.length > 0) {
                var oFirstHeader = aTreeData[0];
                console.log("First Header:", {
                    ApprovalNo: oFirstHeader.ApprovalNo,
                    VendorCode: oFirstHeader.VendorCode,
                    VendorName: oFirstHeader.VendorName,
                    ChildrenCount: oFirstHeader.children ? oFirstHeader.children.length : 0
                });

                if (oFirstHeader.children && oFirstHeader.children.length > 0) {
                    var oFirstChild = oFirstHeader.children[0];
                    console.log("First Child Item:", {
                        ApprovalNo: oFirstChild.ApprovalNo,
                        VendorCode: oFirstChild.VendorCode,
                        VendorNumber: oFirstChild.VendorNumber,
                        VendorName: oFirstChild.VendorName,
                        ItemNum: oFirstChild.ItemNum,
                        AllKeys: Object.keys(oFirstChild).filter(key => key.toLowerCase().includes('vendor'))
                    });
                }
            }
            console.log("============================");
        },

        // Comprehensive debug function to trace the entire approval flow
        debugApprovalFlow: function () {
            console.log("=== COMPREHENSIVE APPROVAL FLOW DEBUG ===");

            // 1. Check if OData model is available
            var oModel = this.getView().getModel("oModel");
            console.log("1. OData Model Available:", !!oModel);
            if (oModel) {
                console.log("   Service URL:", oModel.sServiceUrl);
                console.log("   Metadata Loaded:", !!oModel.getServiceMetadata());
            }

            // 2. Check table selection
            var oTable = this.byId("idPaymentTable");
            var aSelectedItems = oTable ? oTable.getSelectedItems() : [];
            console.log("2. Table Selection:");
            console.log("   Table Available:", !!oTable);
            console.log("   Selected Items:", aSelectedItems.length);

            // 3. Test data availability
            if (oModel) {
                console.log("3. Testing Data Availability:");
                oModel.read("/PaymentItemSet", {
                    urlParameters: {
                        "$top": "1"
                    },
                    success: function (oData) {
                        console.log("   Data Available:", oData.results && oData.results.length > 0);
                        if (oData.results && oData.results.length > 0) {
                            console.log("   Sample Item:", oData.results[0]);

                            // Test payload creation
                            var oPayload = this._createPayloadItem(oData.results[0], "APPROVED", "Test");
                            console.log("   Payload Creation Success:", !!oPayload);
                            console.log("   Key Fields Valid:", !!(oPayload.ApprovalNo && oPayload.VendorCode));
                        }
                    }.bind(this),
                    error: function (oError) {
                        console.error("   Data Load Failed:", oError);
                    }
                });
            }

            // 4. Check dialog state
            console.log("4. Dialog State:");
            console.log("   Dialog Created:", !!this._oApprovalDialog);
            console.log("   Stored Selected Items:", this._aDialogSelectedItems ? this._aDialogSelectedItems.length : 0);
            console.log("   Stored Action Type:", this._sDialogActionType);

            console.log("==========================================");

            return {
                modelAvailable: !!oModel,
                tableAvailable: !!oTable,
                selectedCount: aSelectedItems.length,
                dialogCreated: !!this._oApprovalDialog
            };
        },

        _findHeaderInTreeData: function (aTreeData, sApprovalNo) {
            return aTreeData.find(function (oHeader) {
                return oHeader.ApprovalNo === sApprovalNo && oHeader.isHeader;
            });
        },

        _sendApprovalPayloadToBackend: function (aPayloadItems, sActionType, aSelectedItems) {
            console.log("=== _sendApprovalPayloadToBackend CALLED ===");
            console.log("Payload Items Count:", aPayloadItems.length);
            console.log("Action Type:", sActionType);
            console.log("Selected Items Count:", aSelectedItems.length);

            var oModel = this.getView().getModel("oModel");

            if (!oModel) {
                console.error("❌ OData model 'oModel' not available!");
                MessageToast.show("OData model not available");
                return;
            }

            console.log("✅ OData model found:", oModel);
            console.log("Service URL:", oModel.sServiceUrl);

            console.log("=== COMPLETE PAYLOAD DETAILS ===");
            console.log("Service:", "ZPAYMENT_APPROVAL_SRV");
            console.log("Action:", sActionType);
            console.log("Selected Items:", aPayloadItems.length);
            console.log("=== PAYLOAD ITEMS (DETAILED) ===");
            aPayloadItems.forEach(function (oItem, iIndex) {
                console.log("Item " + (iIndex + 1) + ":");
                console.log("  ApprovalNo:", oItem.ApprovalNo);
                console.log("  VendorCode:", oItem.VendorCode);
                console.log("  PmApprStatus:", oItem.PmApprStatus);
                console.log("  PmApprRemarks:", oItem.PmApprRemarks);
                console.log("  PmApprAmt:", oItem.PmApprAmt);
                console.log("  TdsAmount:", oItem.TdsAmount);
                console.log("  Full Item:", oItem);
                console.log("  ---");
            });
            console.log("=======================================");

            // Send PUT requests for selected items
            console.log("=== CALLING _processBatchUpdate ===");
            console.log("=== CALLING DEEP CREATE (SINGLE REQUEST) ===");
            this._sendDeepCreate(oModel, aPayloadItems, sActionType);

            //this._processBatchUpdate(oModel, aPayloadItems, sActionType, aSelectedItems);
        },
        _sendDeepCreate: function (oModel, aPayloadItems, sActionType) {
    sap.ui.core.BusyIndicator.show(0);

    // Build ONE header with ALL items
    var oPayload = {
        ApprovalNo: aPayloadItems[0].ApprovalNo,
        VendorCode: aPayloadItems[0].VendorCode,
        OverallStatus: sActionType,

        ToItems: {
            results: aPayloadItems.map(function (item) {
                return {
                    ApprovalNo: item.ApprovalNo,
                    VendorCode: item.VendorCode,
                    ItemNum: item.ItemNum,

                    // 🔴 DATE FIX (IMPORTANT)
                    DocDate: item.DocDate ? this._toABAPDate(item.DocDate) : null,
                    PostingDt: item.PostingDt ? this._toABAPDate(item.PostingDt) : null,
                    PmApprOn: this._toABAPDateTime(new Date()),

                    PmApprAmt: item.PmApprAmt,
                    PmApprStatus: item.PmApprStatus,
                    PmApprRemarks: item.PmApprRemarks,
                    TdsAmount: item.TdsAmount
                };
            }.bind(this))
        }
    };
    console.log("🚀 SENDING DEEP CREATE PAYLOAD:", oPayload);

    oModel.create("/PaymentHeaderSet", oPayload, {
        success: function () {
            sap.ui.core.BusyIndicator.hide();
            MessageToast.show("Deep create successful");
        },
        error: function (oError) {
            sap.ui.core.BusyIndicator.hide();
            console.error("Deep create failed", oError);
        }
    });
},
_toABAPDate: function (jsDate) {
    var d = new Date(jsDate);
    return (
        d.getFullYear().toString().padStart(4, "0") +
        (d.getMonth() + 1).toString().padStart(2, "0") +
        d.getDate().toString().padStart(2, "0")
    );
},

_toABAPDateTime: function (jsDate) {
    var d = new Date(jsDate);
    return (
        d.getFullYear().toString().padStart(4, "0") +
        (d.getMonth() + 1).toString().padStart(2, "0") +
        d.getDate().toString().padStart(2, "0") +
        d.getHours().toString().padStart(2, "0") +
        d.getMinutes().toString().padStart(2, "0") +
        d.getSeconds().toString().padStart(2, "0")
    );
}
,

        _checkServiceCapabilities: function (oModel) {
            var oMetadata = oModel.getServiceMetadata();

            console.log("=== SERVICE CAPABILITIES CHECK ===");

            if (!oMetadata) {
                console.log("No metadata available");
                return;
            }

            // Check entity sets and their capabilities
            if (oMetadata.dataServices && oMetadata.dataServices.schema) {
                oMetadata.dataServices.schema.forEach(function (oSchema) {
                    if (oSchema.entityContainer && oSchema.entityContainer[0]) {
                        var oContainer = oSchema.entityContainer[0];

                        // Check entity sets
                        if (oContainer.entitySet) {
                            console.log("Available Entity Sets:");
                            oContainer.entitySet.forEach(function (oEntitySet) {
                                console.log("  - " + oEntitySet.name + " (" + oEntitySet.entityType + ")");
                                console.log("    Creatable:", oEntitySet.creatable !== "false");
                                console.log("    Updatable:", oEntitySet.updatable !== "false");
                                console.log("    Deletable:", oEntitySet.deletable !== "false");
                            });
                        }

                        // Check function imports
                        if (oContainer.functionImport) {
                            console.log("Available Function Imports:");
                            oContainer.functionImport.forEach(function (oFunc) {
                                console.log("  - " + oFunc.name + " (HTTP Method: " + (oFunc.httpMethod || "POST") + ")");
                                if (oFunc.parameter) {
                                    console.log("    Parameters:", oFunc.parameter.map(function (p) { return p.name; }));
                                }
                            });
                        }
                    }

                    // Check entity types
                    if (oSchema.entityType) {
                        console.log("Entity Types:");
                        oSchema.entityType.forEach(function (oEntityType) {
                            if (oEntityType.name === "PaymentItem") {
                                console.log("  PaymentItem properties:");
                                if (oEntityType.property) {
                                    oEntityType.property.forEach(function (oProp) {
                                        console.log("    - " + oProp.name + " (" + oProp.type + ") " +
                                            "Creatable: " + (oProp.creatable !== "false") + ", " +
                                            "Updatable: " + (oProp.updatable !== "false"));
                                    });
                                }
                            }
                        });
                    }
                });
            }

            console.log("==================================");
        },

        _logCurlCommand: function (oBatchCallDetails) {
            var sCurlCommand = "curl -X POST '" + oBatchCallDetails.url + "' \\\n";

            Object.keys(oBatchCallDetails.headers).forEach(function (sHeader) {
                sCurlCommand += "  -H '" + sHeader + ": " + oBatchCallDetails.headers[sHeader] + "' \\\n";
            });

            sCurlCommand += "  --data-raw '" + oBatchCallDetails.body.replace(/'/g, "\\'") + "'";

            console.log("=== CURL COMMAND EQUIVALENT ===");
            console.log(sCurlCommand);
            console.log("===============================");
        },

        _processBatchUpdate: function (oModel, aPayloadItems, sActionType, aSelectedItems) {
            console.log("=== _processBatchUpdate CALLED ===");
            console.log("Model:", oModel);
            console.log("Payload Items Count:", aPayloadItems.length);
            console.log("Action:", sActionType);
            console.log("Selected Items Count:", aSelectedItems.length);

            // Show busy indicator
            sap.ui.core.BusyIndicator.show(0);

            // Process each selected item with PUT call
            console.log("=== CALLING _sendPutRequestsForSelectedItems ===");
           // this._sendPutRequestsForSelectedItems(oModel, aPayloadItems, sActionType, aSelectedItems);
        },

        _sendPutRequestsForSelectedItems: function (oModel, aPayloadItems, sActionType, aSelectedItems) {
            console.log("=== _sendPutRequestsForSelectedItems CALLED ===");
            console.log("Processing " + aPayloadItems.length + " items");

            var sCurrentUser = this._getCurrentUserId();
            var iProcessedCount = 0;
            var iTotalCount = aPayloadItems.length;
            var aErrors = [];

            console.log("Current User:", sCurrentUser);
            console.log("Total Count:", iTotalCount);

            // Process each item sequentially
            var fnProcessNextItem = function (iIndex) {
                console.log("=== PROCESSING ITEM " + (iIndex + 1) + "/" + iTotalCount + " ===");

                if (iIndex >= aPayloadItems.length) {
                    // All items processed
                    console.log("=== ALL ITEMS PROCESSED ===");
                    sap.ui.core.BusyIndicator.hide();

                    if (aErrors.length === 0) {
                        console.log("✅ All " + iTotalCount + " items processed successfully");
                        MessageToast.show(iTotalCount + " items " +
                            (sActionType === "APPROVE" ? "approved" : "rejected") +
                            " and sent to ZPAYMENT_APPROVAL_SRV");
                    } else {
                        console.log("⚠️ Processed " + iProcessedCount + " items successfully, " + aErrors.length + " failed");
                        MessageToast.show("Processed " + iProcessedCount + " items successfully. " +
                            aErrors.length + " items failed.");
                    }

                    return;
                }

                var oPayloadItem = aPayloadItems[iIndex];
                console.log("Current payload item:", oPayloadItem);

                // this._sendSinglePutRequest(oModel, oPayloadItem, sCurrentUser, sActionType, iIndex + 1, iTotalCount,
                //     function (bSuccess) {
                //         console.log("PUT request result for item " + (iIndex + 1) + ":", bSuccess ? "SUCCESS" : "FAILED");
                //         if (bSuccess) {
                //             iProcessedCount++;
                //         } else {
                //             aErrors.push({
                //                 item: oPayloadItem,
                //                 error: "PUT request failed"
                //             });
                //         }
                //         fnProcessNextItem.call(this, iIndex + 1);
                //     }.bind(this));
            }.bind(this);

            console.log("=== STARTING ITEM PROCESSING ===");
            fnProcessNextItem(0);
        },

        _sendSinglePutRequest: function (
            oModel,
            oPayloadItem,
            sCurrentUser,
            sActionType,
            iItemNumber,
            iTotalCount,
            fnCallback
        ) {
            var sApprovalNo = oPayloadItem.ApprovalNo;
            var sVendorCode = oPayloadItem.VendorCode || oPayloadItem.VendorNumber;

            if (!sApprovalNo || !sVendorCode) {
                fnCallback(false);
                return;
            }

            // helpers
            var dec = function (v) {
                return Number(v || 0).toFixed(2);
            };

            var dt = function (v) {
                return v ? new Date(v) : null;
            };

            // POST path (Header Deep Entity)
            var sPath = "/PaymentHeaderSet";

            var oPayload = {
                ApprovalNo: sApprovalNo,
                CreatedOn: dt(oPayloadItem.CreatedOn),
                ProfitCenter: oPayloadItem.ProfitCenter,
                ProfitCenterName: oPayloadItem.ProfitCenterName,
                VendorCode: sVendorCode,
                VendorName: oPayloadItem.VendorName,
                CompanyCode: oPayloadItem.CompanyCode,
                CreatedBy: oPayloadItem.CreatedBy,
                CreationTime: oPayloadItem.CreationTime,
                OverallStatus: oPayloadItem.OverallStatus,

                GrossAmount: dec(oPayloadItem.GrossAmount),
                BaseAmount: dec(oPayloadItem.BaseAmount),
                GSTAmount: dec(oPayloadItem.GSTAmount),
                TDSAmount: dec(oPayloadItem.TDSAmount),
                TotalLiability: dec(oPayloadItem.TotalLiability),
                GST2AReflected: dec(oPayloadItem.GST2AReflected),
                GST2ANotReflected: dec(oPayloadItem.GST2ANotReflected),
                AmountClaimed: dec(oPayloadItem.AmountClaimed),
                ProposedAmount: dec(oPayloadItem.ProposedAmount),

                PMApprovedAmount: dec(oPayloadItem.PMApprovedAmount),
                HODApprovedAmount: dec(oPayloadItem.HODApprovedAmount),
                CFOApprovedAmount: dec(oPayloadItem.CFOApprovedAmount),
                AuditorApprovedAmount: dec(oPayloadItem.AuditorApprovedAmount),
                DirectorApprovedAmount: dec(oPayloadItem.DirectorApprovedAmount),

                ToItems: {
                    results: [
                        {
                            ApprovalNo: sApprovalNo,
                            VendorCode: sVendorCode,
                            VendorName: oPayloadItem.VendorName,
                            ProfitCenter: oPayloadItem.ProfitCenter,
                            ProfitCenterName: oPayloadItem.ProfitCenterName,
                            TaxNum: oPayloadItem.TaxNum,
                            BankKey: oPayloadItem.BankKey,
                            DocNum: oPayloadItem.DocNum,
                            ItemNum: oPayloadItem.ItemNum,
                            LiabHead: oPayloadItem.LiabHead,
                            ReferenceDoc: oPayloadItem.ReferenceDoc,
                            PurchDoc: oPayloadItem.PurchDoc,

                            DocDate: dt(oPayloadItem.DocDate),
                            PostingDt: dt(oPayloadItem.PostingDt),

                            GrossAmt: dec(oPayloadItem.GrossAmt),
                            BaseAmt: dec(oPayloadItem.BaseAmt),
                            GstAmt: dec(oPayloadItem.GstAmt),
                            TdsAmount: dec(oPayloadItem.TdsAmount),
                            TotalLiability: dec(oPayloadItem.TotalLiability),

                            Gst2aRef: dec(oPayloadItem.Gst2aRef),
                            Gst2aNref: dec(oPayloadItem.Gst2aNref),
                            AmtClaimed: dec(oPayloadItem.AmtClaimed),
                            ProposedAmt: dec(oPayloadItem.ProposedAmt),

                            Currency: "",
                            Gstr1Details: oPayloadItem.Gstr1Details,
                            Remark: oPayloadItem.Remark,

                            AccountHolder: oPayloadItem.AccountHolder,
                            AccountNumber: oPayloadItem.AccountNumber,
                            BankName: oPayloadItem.BankName,
                            Branch: oPayloadItem.Branch,

                            ModeOfPayment: oPayloadItem.ModeOfPayment,
                            UtrNo: oPayloadItem.UtrNo,

                            PaidAmount1: dec(oPayloadItem.PaidAmount1),
                            PaymentDate1: dt(oPayloadItem.PaymentDate1),
                            PaidAmount2: dec(oPayloadItem.PaidAmount2),
                            PaymentDate2: dt(oPayloadItem.PaymentDate2),

                            TotalBalOut: dec(oPayloadItem.TotalBalOut),
                            BalancePayable: dec(oPayloadItem.BalancePayable),

                            // Approval fields
                            PmApprAmt: dec(oPayloadItem.PmApprAmt || "44444.00"),
                            PmUserId: oPayloadItem.PmUserId || "",
                            PmApprStatus: oPayloadItem.PmApprStatus || "",
                            PmApprOn: oPayloadItem.PmApprOn || null,
                            PmApprRemarks: oPayloadItem.PmApprRemarks || "",

                            HodApprAmt: dec(oPayloadItem.HodApprAmt || "44444.00"),
                            HodUserId: oPayloadItem.HodUserId || "",
                            HodApprStatus: oPayloadItem.HodApprStatus || "",
                            HodApprOn: oPayloadItem.HodApprOn || null,
                            HodApprRemarks: oPayloadItem.HodApprRemarks || "",

                            CfoApprAmt: dec(oPayloadItem.CfoApprAmt || "0.00"),
                            CfoUserId: oPayloadItem.CfoUserId || "",
                            CfoApprStatus: oPayloadItem.CfoApprStatus || "",
                            CfoApprOn: oPayloadItem.CfoApprOn || null,
                            CfoApprRemarks: oPayloadItem.CfoApprRemarks || "",

                            AudApprAmt: dec(oPayloadItem.AudApprAmt || "0.00"),
                            AudUserId: oPayloadItem.AudUserId || "",
                            AudApprStatus: oPayloadItem.AudApprStatus || "",
                            AudApprOn: oPayloadItem.AudApprOn || null,
                            AudApprRemarks: oPayloadItem.AudApprRemarks || "",

                            DirApprAmt: dec(oPayloadItem.DirApprAmt || "0.00"),
                            DirUserId: oPayloadItem.DirUserId || "",
                            DirApprStatus: oPayloadItem.DirApprStatus || "",
                            DirApprOn: oPayloadItem.DirApprOn || null,
                            DirApprRemarks: oPayloadItem.DirApprRemarks || ""
                        }
                    ]
                }
            };
            console.log("Prepared payload for POST:", oPayload);


            // 🔴 IMPORTANT:
            // Do NOT send approval fields during POST - remove them from the results array
            if (oPayload.ToItems && oPayload.ToItems.results && oPayload.ToItems.results.length > 0) {
                delete oPayload.ToItems.results[0].PmApprStatus;
                delete oPayload.ToItems.results[0].PmApprOn;
                delete oPayload.ToItems.results[0].PmApprRemarks;
            }

            oModel.create(sPath, oPayload, {
                success: function () {
                    fnCallback(true);
                },
                error: function () {
                    fnCallback(false);
                }
            });
        }
        ,

        _tryAlternativeUpdateApproaches: function (oModel, aPayloadItems, sActionType, aSelectedItems) {
            console.log("=== TRYING ALTERNATIVE UPDATE APPROACHES ===");

            // Try multiple approaches in sequence
            this._tryDirectEntityUpdate(oModel, aPayloadItems, sActionType, aSelectedItems);
        },

        _tryDirectEntityUpdate: function (oModel, aPayloadItems, sActionType, aSelectedItems) {
            console.log("Attempting direct entity update with different approaches...");

            var sCurrentUser = this._getCurrentUserId();
            var iProcessedCount = 0;
            var iTotalCount = aPayloadItems.length;
            var aErrors = [];

            // Process each item with multiple update strategies
            var fnProcessNextItem = function (iIndex) {
                if (iIndex >= aPayloadItems.length) {
                    sap.ui.core.BusyIndicator.hide();

                    if (aErrors.length === 0) {
                        console.log("All " + iTotalCount + " items processed successfully");
                        MessageToast.show(iTotalCount + " items " +
                            (sActionType === "APPROVE" ? "approved" : "rejected") +
                            " successfully updated in backend");
                    } else if (iProcessedCount > 0) {
                        console.log("Partial success: " + iProcessedCount + " items processed, " + aErrors.length + " errors");
                        MessageToast.show("Processed " + iProcessedCount + " items successfully. " +
                            aErrors.length + " items failed.");
                    } else {
                        console.log("All update attempts failed, updating local model only");
                        MessageToast.show("Backend updates failed. Items updated locally only.");
                    }

                    return;
                }

                var oPayloadItem = aPayloadItems[iIndex];
                this._tryMultipleUpdateMethods(oModel, oPayloadItem, sCurrentUser, iIndex + 1, iTotalCount,
                    function (bSuccess) {
                        if (bSuccess) {
                            iProcessedCount++;
                        } else {
                            aErrors.push({
                                item: oPayloadItem,
                                error: "All update methods failed"
                            });
                        }
                        fnProcessNextItem.call(this, iIndex + 1);
                    }.bind(this));
            }.bind(this);

            fnProcessNextItem(0);
        },

        _tryMultipleUpdateMethods: function (oModel, oPayloadItem, sCurrentUser, iItemNumber, iTotalCount, fnCallback) {
            var sApprovalNo = oPayloadItem.ApprovalNo;
            var sVendorCode = oPayloadItem.VendorCode || oPayloadItem.VendorNumber;

            console.log("Trying multiple update methods for item " + iItemNumber + "/" + iTotalCount);

            var oUpdateData = {
                PmApprAmt: oPayloadItem.PmApprAmt,
                PmApprStatus: oPayloadItem.PmApprStatus,
                PmApprRemarks: oPayloadItem.PmApprRemarks,
                PmApprOn: new Date(),
                PmUserId: sCurrentUser,
                TdsAmount: oPayloadItem.TdsAmount
            };

            // Method 1: Try standard UPDATE with PUT
            this._tryUpdateMethod1(oModel, sApprovalNo, sVendorCode, oUpdateData, iItemNumber, function (bSuccess) {
                if (bSuccess) {
                    fnCallback(true);
                } else {
                    // Method 2: Try UPDATE with MERGE
                    this._tryUpdateMethod2(oModel, sApprovalNo, sVendorCode, oUpdateData, iItemNumber, function (bSuccess) {
                        if (bSuccess) {
                            fnCallback(true);
                        } else {
                            // Method 3: Try PATCH method
                            this._tryUpdateMethod3(oModel, sApprovalNo, sVendorCode, oUpdateData, iItemNumber, function (bSuccess) {
                                if (bSuccess) {
                                    fnCallback(true);
                                } else {
                                    // Method 4: Try different entity path
                                    this._tryUpdateMethod4(oModel, sApprovalNo, sVendorCode, oUpdateData, iItemNumber, function (bSuccess) {
                                        fnCallback(bSuccess);
                                    }.bind(this));
                                }
                            }.bind(this));
                        }
                    }.bind(this));
                }
            }.bind(this));
        },

        _tryUpdateMethod1: function (oModel, sApprovalNo, sVendorCode, oUpdateData, iItemNumber, fnCallback) {
            var sPath = "/PaymentItemSet(ApprovalNo='" + sApprovalNo + "',VendorCode='" + sVendorCode + "')";

            console.log("Method 1 - Standard UPDATE (PUT): " + sPath);

            oModel.update(sPath, oUpdateData, {
                success: function (oData) {
                    console.log("Method 1 SUCCESS for item " + iItemNumber);
                    fnCallback(true);
                },
                error: function (oError) {
                    console.log("Method 1 FAILED for item " + iItemNumber + ":", oError.message);
                    fnCallback(false);
                }
            });
        },

        _tryUpdateMethod2: function (oModel, sApprovalNo, sVendorCode, oUpdateData, iItemNumber, fnCallback) {
            var sPath = "/PaymentItemSet(ApprovalNo='" + sApprovalNo + "',VendorCode='" + sVendorCode + "')";

            console.log("Method 2 - UPDATE with MERGE: " + sPath);

            oModel.update(sPath, oUpdateData, {
                merge: true,
                success: function (oData) {
                    console.log("Method 2 SUCCESS for item " + iItemNumber);
                    fnCallback(true);
                },
                error: function (oError) {
                    console.log("Method 2 FAILED for item " + iItemNumber + ":", oError.message);
                    fnCallback(false);
                }
            });
        },

        _tryUpdateMethod3: function (oModel, sApprovalNo, sVendorCode, oUpdateData, iItemNumber, fnCallback) {
            // Try using jQuery AJAX directly with PATCH method
            var sServiceUrl = oModel.sServiceUrl || "";
            var sPath = "/PaymentItemSet(ApprovalNo='" + sApprovalNo + "',VendorCode='" + sVendorCode + "')";
            var sUrl = sServiceUrl + sPath;

            console.log("Method 3 - Direct PATCH request: " + sUrl);

            jQuery.ajax({
                url: sUrl,
                type: "PATCH",
                data: JSON.stringify(oUpdateData),
                contentType: "application/json",
                headers: {
                    "Accept": "application/json",
                    "DataServiceVersion": "2.0",
                    "X-Requested-With": "XMLHttpRequest"
                },
                success: function (oData) {
                    console.log("Method 3 SUCCESS for item " + iItemNumber);
                    fnCallback(true);
                },
                error: function (jqXHR, textStatus, errorThrown) {
                    console.log("Method 3 FAILED for item " + iItemNumber + ":", textStatus, errorThrown);
                    fnCallback(false);
                }
            });
        },

        _tryUpdateMethod4: function (oModel, sApprovalNo, sVendorCode, oUpdateData, iItemNumber, fnCallback) {
            // Try different entity path - maybe there's a different key structure
            var sPath = "/PaymentItemSet('" + sApprovalNo + "')";

            console.log("Method 4 - Alternative path structure: " + sPath);

            oModel.update(sPath, oUpdateData, {
                success: function (oData) {
                    console.log("Method 4 SUCCESS for item " + iItemNumber);
                    fnCallback(true);
                },
                error: function (oError) {
                    console.log("Method 4 FAILED for item " + iItemNumber + ":", oError.message);

                    // Try one more alternative - single key with VendorCode
                    var sPath2 = "/PaymentItemSet('" + sVendorCode + "')";
                    console.log("Method 4b - VendorCode only path: " + sPath2);

                    oModel.update(sPath2, oUpdateData, {
                        success: function (oData) {
                            console.log("Method 4b SUCCESS for item " + iItemNumber);
                            fnCallback(true);
                        },
                        error: function (oError) {
                            console.log("Method 4b FAILED for item " + iItemNumber + ":", oError.message);

                            // Final attempt: Try CREATE approach
                            this._tryCreateApprovalRecord(oModel, sApprovalNo, sVendorCode, oUpdateData, iItemNumber, fnCallback);
                        }.bind(this)
                    });
                }.bind(this)
            });
        },

        _tryCreateApprovalRecord: function (oModel, sApprovalNo, sVendorCode, oUpdateData, iItemNumber, fnCallback) {
            console.log("Method 5 - CREATE approval record for item " + iItemNumber);

            // Try to create a new approval record
            var oCreateData = Object.assign({}, oUpdateData, {
                ApprovalNo: sApprovalNo,
                VendorCode: sVendorCode,
                ProcessedOn: new Date(),
                Action: oUpdateData.PmApprStatus === "APPROVED" ? "APPROVE" : "REJECT"
            });

            // Try creating in PaymentItemSet
            oModel.create("/PaymentItemSet", oCreateData, {
                success: function (oData) {
                    console.log("Method 5 CREATE SUCCESS for item " + iItemNumber);
                    fnCallback(true);
                },
                error: function (oError) {
                    console.log("Method 5 CREATE FAILED for item " + iItemNumber + ":", oError.message);

                    // Try creating in a potential ApprovalSet
                    this._tryCreateInApprovalSet(oModel, oCreateData, iItemNumber, fnCallback);
                }.bind(this)
            });
        },

        _tryCreateInApprovalSet: function (oModel, oCreateData, iItemNumber, fnCallback) {
            console.log("Method 6 - Focused PaymentItemSet update attempts for item " + iItemNumber);

            // Since we know PaymentItemSet exists, let's try different approaches specifically for it
            this._tryPaymentItemSetSpecificUpdates(oModel, oCreateData, iItemNumber, fnCallback);
        },

        _tryPaymentItemSetSpecificUpdates: function (oModel, oCreateData, iItemNumber, fnCallback) {
            var sApprovalNo = oCreateData.ApprovalNo;
            var sVendorCode = oCreateData.VendorCode;

            console.log("=== PAYMENTITEMSET UPDATE WITH CONFIRMED KEYS ===");
            console.log("Keys: ApprovalNo and VendorCode (confirmed)");
            console.log("ApprovalNo:", sApprovalNo);
            console.log("VendorCode:", sVendorCode);

            // Validate that we have the required key values
            if (!sApprovalNo || !sVendorCode) {
                console.error("Missing required key values:");
                console.error("  ApprovalNo:", sApprovalNo);
                console.error("  VendorCode:", sVendorCode);
                fnCallback(false);
                return;
            }

            // Clean and format the key values
            var sCleanApprovalNo = String(sApprovalNo).trim();
            var sCleanVendorCode = String(sVendorCode).trim();

            console.log("Cleaned key values:");
            console.log("  ApprovalNo:", "'" + sCleanApprovalNo + "'");
            console.log("  VendorCode:", "'" + sCleanVendorCode + "'");

            // Build the correct path
            var sPath = "/PaymentItemSet(ApprovalNo='" + sCleanApprovalNo + "',VendorCode='" + sCleanVendorCode + "')";
            console.log("Update path:", sPath);

            // First, let's verify this item exists by reading it
            this._verifyItemExistsBeforeUpdate(oModel, sPath, oCreateData, iItemNumber, fnCallback);
        },

        _verifyItemExistsBeforeUpdate: function (oModel, sPath, oUpdateData, iItemNumber, fnCallback) {
            console.log("=== VERIFYING ITEM EXISTS BEFORE UPDATE ===");
            console.log("Reading path:", sPath);

            oModel.read(sPath, {
                success: function (oData) {
                    console.log("✓ Item exists - READ successful");
                    console.log("Item data:", {
                        ApprovalNo: oData.ApprovalNo,
                        VendorCode: oData.VendorCode,
                        PmApprStatus: oData.PmApprStatus,
                        PmApprAmt: oData.PmApprAmt,
                        PmApprRemarks: oData.PmApprRemarks
                    });

                    // Now try to update
                    this._performConfirmedUpdate(oModel, sPath, oUpdateData, iItemNumber, fnCallback);
                }.bind(this),
                error: function (oError) {
                    console.error("✗ Item does not exist or READ failed:", oError.message);
                    console.log("This might indicate:");
                    console.log("1. The key values are incorrect");
                    console.log("2. The item doesn't exist in the backend");
                    console.log("3. There's a different key structure");

                    // Try to find the correct item by searching
                    this._searchForCorrectItem(oModel, oUpdateData, iItemNumber, fnCallback);
                }.bind(this)
            });
        },

        _performConfirmedUpdate: function (oModel, sPath, oUpdateData, iItemNumber, fnCallback) {
            console.log("=== PERFORMING CONFIRMED UPDATE ===");
            console.log("Path:", sPath);

            var oCleanUpdateData = {
                PmApprAmt: String(oUpdateData.PmApprAmt || "0"),
                PmApprStatus: String(oUpdateData.PmApprStatus || ""),
                PmApprRemarks: String(oUpdateData.PmApprRemarks || ""),
                PmApprOn: new Date(),
                PmUserId: String(oUpdateData.PmUserId || this._getCurrentUserId()),
                TdsAmount: String(oUpdateData.TdsAmount || "0")
            };

            console.log("Update data:", oCleanUpdateData);

            oModel.update(sPath, oCleanUpdateData, {
                success: function (oData) {
                    console.log("✓ UPDATE SUCCESSFUL for item " + iItemNumber);
                    console.log("Updated successfully with path:", sPath);
                    fnCallback(true);
                },
                error: function (oError) {
                    console.error("✗ UPDATE FAILED for item " + iItemNumber + ":", oError.message);
                    console.log("Error details:", oError);

                    // Try alternative update methods
                    this._tryAlternativeUpdateMethods(oModel, sPath, oCleanUpdateData, iItemNumber, fnCallback);
                }.bind(this)
            });
        },

        _searchForCorrectItem: function (oModel, oUpdateData, iItemNumber, fnCallback) {
            console.log("=== SEARCHING FOR CORRECT ITEM ===");
            console.log("Searching for ApprovalNo:", oUpdateData.ApprovalNo);

            // Search for items with the same ApprovalNo
            oModel.read("/PaymentItemSet", {
                urlParameters: {
                    "$filter": "ApprovalNo eq '" + oUpdateData.ApprovalNo + "'",
                    "$top": "10"
                },
                success: function (oData) {
                    if (oData && oData.results && oData.results.length > 0) {
                        console.log("Found " + oData.results.length + " items with ApprovalNo " + oUpdateData.ApprovalNo + ":");

                        oData.results.forEach(function (oItem, iIndex) {
                            console.log("Item " + (iIndex + 1) + ":");
                            console.log("  ApprovalNo:", oItem.ApprovalNo);
                            console.log("  VendorCode:", oItem.VendorCode);
                            console.log("  VendorNumber:", oItem.VendorNumber);
                            console.log("  ItemNum:", oItem.ItemNum);
                        });

                        // Try to find a matching item by VendorCode
                        var oMatchingItem = oData.results.find(function (oItem) {
                            return oItem.VendorCode === oUpdateData.VendorCode ||
                                oItem.VendorNumber === oUpdateData.VendorCode;
                        });

                        if (oMatchingItem) {
                            console.log("Found matching item:", oMatchingItem);
                            var sCorrectPath = "/PaymentItemSet(ApprovalNo='" + oMatchingItem.ApprovalNo + "',VendorCode='" + oMatchingItem.VendorCode + "')";
                            console.log("Trying with correct path:", sCorrectPath);
                            this._performConfirmedUpdate(oModel, sCorrectPath, oUpdateData, iItemNumber, fnCallback);
                        } else {
                            console.log("No matching item found");
                            fnCallback(false);
                        }
                    } else {
                        console.log("No items found with ApprovalNo:", oUpdateData.ApprovalNo);
                        fnCallback(false);
                    }
                }.bind(this),
                error: function (oError) {
                    console.error("Search failed:", oError);
                    fnCallback(false);
                }
            });
        },

        _tryAlternativeUpdateMethods: function (oModel, sPath, oUpdateData, iItemNumber, fnCallback) {
            console.log("=== TRYING ALTERNATIVE UPDATE METHODS ===");

            // Method 1: Try with merge option
            console.log("Method 1: UPDATE with merge option");
            oModel.update(sPath, oUpdateData, {
                merge: true,
                success: function (oData) {
                    console.log("✓ UPDATE with merge SUCCESSFUL for item " + iItemNumber);
                    fnCallback(true);
                },
                error: function (oError) {
                    console.log("✗ UPDATE with merge FAILED:", oError.message);

                    // Method 2: Try PATCH with jQuery
                    this._tryPatchMethod(sPath, oUpdateData, iItemNumber, fnCallback);
                }.bind(this)
            });
        },

        _tryPatchMethod: function (sPath, oUpdateData, iItemNumber, fnCallback) {
            var oModel = this.getView().getModel("oModel");
            var sServiceUrl = oModel.sServiceUrl || "";
            var sUrl = sServiceUrl + sPath;

            console.log("Method 2: Direct PATCH request to:", sUrl);

            jQuery.ajax({
                url: sUrl,
                type: "PATCH",
                data: JSON.stringify(oUpdateData),
                contentType: "application/json",
                headers: {
                    "Accept": "application/json",
                    "DataServiceVersion": "2.0",
                    "X-Requested-With": "XMLHttpRequest"
                },
                success: function (oData) {
                    console.log("✓ PATCH SUCCESSFUL for item " + iItemNumber);
                    fnCallback(true);
                },
                error: function (jqXHR, textStatus, errorThrown) {
                    console.log("✗ PATCH FAILED:", textStatus, errorThrown);
                    console.log("Response:", jqXHR.responseText);
                    fnCallback(false);
                }
            });
        },

        _analyzePaymentItemSetKeys: function (oModel) {
            var oMetadata = oModel.getServiceMetadata();

            console.log("=== COMPREHENSIVE PAYMENTITEMSET KEY ANALYSIS ===");

            if (oMetadata && oMetadata.dataServices && oMetadata.dataServices.schema) {
                oMetadata.dataServices.schema.forEach(function (oSchema) {
                    console.log("Schema Namespace:", oSchema.namespace);

                    if (oSchema.entityType) {
                        var oPaymentItemType = oSchema.entityType.find(function (oType) {
                            return oType.name === "PaymentItem";
                        });

                        if (oPaymentItemType) {
                            console.log("PaymentItem EntityType found:");
                            console.log("  Name:", oPaymentItemType.name);

                            // Show key properties in detail
                            if (oPaymentItemType.key && oPaymentItemType.key.propertyRef) {
                                console.log("  Key Properties (" + oPaymentItemType.key.propertyRef.length + "):");
                                oPaymentItemType.key.propertyRef.forEach(function (oKeyProp) {
                                    console.log("    - " + oKeyProp.name);
                                });

                                // Generate sample key path
                                var aSampleKeys = oPaymentItemType.key.propertyRef.map(function (oKeyProp) {
                                    return oKeyProp.name + "='SAMPLE_VALUE'";
                                });
                                console.log("  Sample Key Path: /PaymentItemSet(" + aSampleKeys.join(",") + ")");
                            }

                            // Show all properties with their types and constraints
                            if (oPaymentItemType.property) {
                                console.log("  All Properties (" + oPaymentItemType.property.length + "):");
                                oPaymentItemType.property.forEach(function (oProp) {
                                    var sKeyIndicator = "";
                                    if (oPaymentItemType.key && oPaymentItemType.key.propertyRef) {
                                        var bIsKey = oPaymentItemType.key.propertyRef.some(function (oKeyProp) {
                                            return oKeyProp.name === oProp.name;
                                        });
                                        sKeyIndicator = bIsKey ? " [KEY]" : "";
                                    }

                                    var sConstraints = "";
                                    if (oProp.maxLength) sConstraints += " MaxLength:" + oProp.maxLength;
                                    if (oProp.nullable === "false") sConstraints += " NotNull";
                                    if (oProp.creatable === "false") sConstraints += " NotCreatable";
                                    if (oProp.updatable === "false") sConstraints += " NotUpdatable";

                                    console.log("    - " + oProp.name + " (" + oProp.type + ")" + sKeyIndicator + sConstraints);
                                });
                            }
                        } else {
                            console.log("PaymentItem EntityType not found. Available EntityTypes:");
                            oSchema.entityType.forEach(function (oType) {
                                console.log("  - " + oType.name);
                            });
                        }
                    }

                    // Check entity sets in detail
                    if (oSchema.entityContainer && oSchema.entityContainer[0] && oSchema.entityContainer[0].entitySet) {
                        var oPaymentItemSet = oSchema.entityContainer[0].entitySet.find(function (oSet) {
                            return oSet.name === "PaymentItemSet";
                        });

                        if (oPaymentItemSet) {
                            console.log("PaymentItemSet EntitySet found:");
                            console.log("  Name:", oPaymentItemSet.name);
                            console.log("  EntityType:", oPaymentItemSet.entityType);
                            console.log("  Creatable:", oPaymentItemSet.creatable !== "false");
                            console.log("  Updatable:", oPaymentItemSet.updatable !== "false");
                            console.log("  Deletable:", oPaymentItemSet.deletable !== "false");
                            console.log("  Pageable:", oPaymentItemSet.pageable !== "false");
                            console.log("  Addressable:", oPaymentItemSet.addressable !== "false");
                        }
                    }
                });
            } else {
                console.log("No metadata available or metadata structure is different");
            }

            console.log("================================================");

            // Also try to get the raw metadata XML for more details
            this._getRawMetadata(oModel);
        },

        _getRawMetadata: function (oModel) {
            var sServiceUrl = oModel.sServiceUrl || "";
            var sMetadataUrl = sServiceUrl + "/$metadata";

            console.log("=== RAW METADATA ANALYSIS ===");
            console.log("Fetching metadata from:", sMetadataUrl);

            jQuery.ajax({
                url: sMetadataUrl,
                type: "GET",
                dataType: "xml",
                success: function (oXmlData) {
                    console.log("Raw metadata XML received");

                    // Parse XML to find PaymentItem key structure
                    var $xml = jQuery(oXmlData);
                    var $paymentItemType = $xml.find('EntityType[Name="PaymentItem"]');

                    if ($paymentItemType.length > 0) {
                        console.log("PaymentItem EntityType found in XML:");

                        var $keys = $paymentItemType.find('Key PropertyRef');
                        console.log("Key properties from XML:");
                        $keys.each(function () {
                            console.log("  - " + jQuery(this).attr('Name'));
                        });

                        var $properties = $paymentItemType.find('Property');
                        console.log("All properties from XML:");
                        $properties.each(function () {
                            var $prop = jQuery(this);
                            console.log("  - " + $prop.attr('Name') + " (" + $prop.attr('Type') + ")");
                        });
                    }
                },
                error: function (jqXHR, textStatus, errorThrown) {
                    console.log("Failed to fetch raw metadata:", textStatus, errorThrown);
                }
            });

            console.log("=============================");
        },

        _tryKeyVariations: function (oModel, aKeyVariations, oUpdateData, iItemNumber, iKeyIndex, fnCallback) {
            if (iKeyIndex >= aKeyVariations.length) {
                console.log("All key variations failed for item " + iItemNumber + ". Trying dynamic key discovery...");
                this._tryDynamicKeyDiscovery(oModel, oUpdateData, iItemNumber, fnCallback);
                return;
            }

            var sPath = aKeyVariations[iKeyIndex];
            console.log("Trying key variation " + (iKeyIndex + 1) + "/" + aKeyVariations.length + ": " + sPath);

            // Prepare clean update data (only the fields we want to update)
            var oCleanUpdateData = {
                PmApprAmt: oUpdateData.PmApprAmt,
                PmApprStatus: oUpdateData.PmApprStatus,
                PmApprRemarks: oUpdateData.PmApprRemarks,
                PmApprOn: oUpdateData.PmApprOn || new Date(),
                PmUserId: oUpdateData.PmUserId,
                TdsAmount: oUpdateData.TdsAmount
            };

            oModel.update(sPath, oCleanUpdateData, {
                success: function (oData) {
                    console.log("✓ SUCCESS with key variation " + (iKeyIndex + 1) + " for item " + iItemNumber);
                    console.log("Successful path:", sPath);
                    fnCallback(true);
                },
                error: function (oError) {
                    console.log("✗ FAILED with key variation " + (iKeyIndex + 1) + " for item " + iItemNumber + ":", oError.message);

                    // Try next variation
                    this._tryKeyVariations(oModel, aKeyVariations, oUpdateData, iItemNumber, iKeyIndex + 1, fnCallback);
                }.bind(this)
            });
        },

        _tryDynamicKeyDiscovery: function (oModel, oUpdateData, iItemNumber, fnCallback) {
            console.log("=== DYNAMIC KEY DISCOVERY ===");

            // First, let's get actual data from PaymentItemSet to see the real structure
            oModel.read("/PaymentItemSet", {
                urlParameters: {
                    "$top": "5",
                    "$filter": "ApprovalNo eq '" + oUpdateData.ApprovalNo + "'"
                },
                success: function (oData) {
                    if (oData && oData.results && oData.results.length > 0) {
                        console.log("Found matching PaymentItemSet entries:");
                        oData.results.forEach(function (oItem, iIndex) {
                            console.log("Entry " + (iIndex + 1) + ":", {
                                ApprovalNo: oItem.ApprovalNo,
                                VendorCode: oItem.VendorCode,
                                VendorNumber: oItem.VendorNumber,
                                ItemNum: oItem.ItemNum,
                                TaxNum: oItem.TaxNum,
                                DocNum: oItem.DocNum
                            });
                        });

                        // Try to find the exact matching item
                        var oMatchingItem = oData.results.find(function (oItem) {
                            return (oItem.VendorCode === oUpdateData.VendorCode ||
                                oItem.VendorNumber === oUpdateData.VendorCode);
                        });

                        if (oMatchingItem) {
                            console.log("Found exact matching item:", oMatchingItem);
                            this._tryDiscoveredKeys(oModel, oMatchingItem, oUpdateData, iItemNumber, fnCallback);
                        } else {
                            console.log("No exact match found, trying first item structure");
                            this._tryDiscoveredKeys(oModel, oData.results[0], oUpdateData, iItemNumber, fnCallback);
                        }
                    } else {
                        console.log("No PaymentItemSet data found for ApprovalNo:", oUpdateData.ApprovalNo);
                        fnCallback(false);
                    }
                }.bind(this),
                error: function (oError) {
                    console.error("Failed to read PaymentItemSet for key discovery:", oError);
                    fnCallback(false);
                }
            });
        },

        _tryDiscoveredKeys: function (oModel, oReferenceItem, oUpdateData, iItemNumber, fnCallback) {
            console.log("=== TRYING DISCOVERED KEY STRUCTURES ===");
            console.log("Reference item:", oReferenceItem);

            // Build key paths based on actual data structure
            var aDiscoveredPaths = [];

            // Try all possible key combinations from the reference item
            if (oReferenceItem.ApprovalNo && oReferenceItem.VendorCode) {
                aDiscoveredPaths.push("/PaymentItemSet(ApprovalNo='" + oReferenceItem.ApprovalNo + "',VendorCode='" + oReferenceItem.VendorCode + "')");
            }

            if (oReferenceItem.ApprovalNo && oReferenceItem.VendorNumber) {
                aDiscoveredPaths.push("/PaymentItemSet(ApprovalNo='" + oReferenceItem.ApprovalNo + "',VendorNumber='" + oReferenceItem.VendorNumber + "')");
            }

            if (oReferenceItem.ApprovalNo && oReferenceItem.ItemNum) {
                aDiscoveredPaths.push("/PaymentItemSet(ApprovalNo='" + oReferenceItem.ApprovalNo + "',ItemNum='" + oReferenceItem.ItemNum + "')");
            }

            if (oReferenceItem.ApprovalNo && oReferenceItem.TaxNum) {
                aDiscoveredPaths.push("/PaymentItemSet(ApprovalNo='" + oReferenceItem.ApprovalNo + "',TaxNum='" + oReferenceItem.TaxNum + "')");
            }

            if (oReferenceItem.ApprovalNo && oReferenceItem.DocNum) {
                aDiscoveredPaths.push("/PaymentItemSet(ApprovalNo='" + oReferenceItem.ApprovalNo + "',DocNum='" + oReferenceItem.DocNum + "')");
            }

            // Try three-key combinations
            if (oReferenceItem.ApprovalNo && oReferenceItem.VendorCode && oReferenceItem.ItemNum) {
                aDiscoveredPaths.push("/PaymentItemSet(ApprovalNo='" + oReferenceItem.ApprovalNo + "',VendorCode='" + oReferenceItem.VendorCode + "',ItemNum='" + oReferenceItem.ItemNum + "')");
            }

            console.log("Discovered paths to try:", aDiscoveredPaths);

            if (aDiscoveredPaths.length === 0) {
                console.log("No valid key combinations discovered");
                fnCallback(false);
                return;
            }

            this._tryDiscoveredPaths(oModel, aDiscoveredPaths, oUpdateData, iItemNumber, 0, fnCallback);
        },

        _tryDiscoveredPaths: function (oModel, aDiscoveredPaths, oUpdateData, iItemNumber, iPathIndex, fnCallback) {
            if (iPathIndex >= aDiscoveredPaths.length) {
                console.log("All discovered paths failed for item " + iItemNumber);
                fnCallback(false);
                return;
            }

            var sPath = aDiscoveredPaths[iPathIndex];
            console.log("Trying discovered path " + (iPathIndex + 1) + "/" + aDiscoveredPaths.length + ": " + sPath);

            var oCleanUpdateData = {
                PmApprAmt: oUpdateData.PmApprAmt,
                PmApprStatus: oUpdateData.PmApprStatus,
                PmApprRemarks: oUpdateData.PmApprRemarks,
                PmApprOn: oUpdateData.PmApprOn || new Date(),
                PmUserId: oUpdateData.PmUserId,
                TdsAmount: oUpdateData.TdsAmount
            };

            oModel.update(sPath, oCleanUpdateData, {
                success: function (oData) {
                    console.log("✓ SUCCESS with discovered path " + (iPathIndex + 1) + " for item " + iItemNumber);
                    console.log("Successful path:", sPath);
                    fnCallback(true);
                },
                error: function (oError) {
                    console.log("✗ FAILED with discovered path " + (iPathIndex + 1) + " for item " + iItemNumber + ":", oError.message);

                    // Try next path
                    this._tryDiscoveredPaths(oModel, aDiscoveredPaths, oUpdateData, iItemNumber, iPathIndex + 1, fnCallback);
                }.bind(this)
            });
        },

        // Method to test service endpoints manually
        _testServiceEndpoints: function () {
            var oModel = this.getView().getModel("oModel");
            var sServiceUrl = oModel.sServiceUrl || "";

            console.log("=== TESTING KNOWN SERVICE ENDPOINTS ===");
            console.log("Service URL:", sServiceUrl);

            // Test the known endpoints
            var aEndpointsToTest = [
                { path: "/PaymentItemSet", description: "Payment Items (target for updates)" },
                { path: "/PaymentHeaderSet", description: "Payment Headers" },
                { path: "/$metadata", description: "Service Metadata" },
                { path: "/PaymentItemSet/$count", description: "Item Count" },
                { path: "/PaymentHeaderSet/$count", description: "Header Count" }
            ];

            aEndpointsToTest.forEach(function (oEndpoint) {
                var sTestUrl = sServiceUrl + oEndpoint.path;
                console.log("Testing: " + oEndpoint.path + " - " + oEndpoint.description);

                jQuery.ajax({
                    url: sTestUrl,
                    type: "GET",
                    headers: {
                        "Accept": "application/json",
                        "DataServiceVersion": "2.0"
                    },
                    success: function (oData) {
                        console.log("✓ " + oEndpoint.path + " - Available");
                        if (oEndpoint.path === "/PaymentItemSet" && oData && oData.d && oData.d.results) {
                            console.log("  Sample PaymentItem keys:", Object.keys(oData.d.results[0] || {}));
                        }
                    },
                    error: function (jqXHR) {
                        console.log("✗ " + oEndpoint.path + " - " + jqXHR.status + " " + jqXHR.statusText);
                    }
                });
            });

            console.log("==========================================");
        },

        // Simple test method for manual testing
        testPutRequest: function (sApprovalNo, sVendorCode) {
            if (!sApprovalNo || !sVendorCode) {
                console.log("Usage: this.getView().getController().testPutRequest('0000000017', '10000037')");
                return;
            }

            var oModel = this.getView().getModel("oModel");
            var sCurrentUser = this._getCurrentUserId();

            var oTestPayload = {
                ApprovalNo: sApprovalNo,
                VendorCode: sVendorCode,
                PmApprAmt: "1000.00",
                PmApprStatus: "APPROVED",
                PmApprRemarks: "Test approval from console",
                PmApprOn: new Date(),
                PmUserId: sCurrentUser,
                TdsAmount: "50.00"
            };

            this._sendSinglePutRequest(oModel, oTestPayload, sCurrentUser, "APPROVE", 1, 1, function (bSuccess) {
                if (bSuccess) {
                    MessageToast.show("Test PUT request successful!");
                } else {
                    MessageToast.show("Test PUT request failed - check console");
                }
            });
        },

        // Method to show current data values for debugging
        debugCurrentDataValues: function () {
            var oTreeModel = this.getView().getModel("treeData");
            var aTreeData = oTreeModel.getData().treeData;

            console.log("=== CURRENT DATA VALUES DEBUG ===");

            if (aTreeData.length > 0) {
                console.log("Headers found:", aTreeData.length);

                aTreeData.forEach(function (oHeader, iHeaderIndex) {
                    console.log("Header " + (iHeaderIndex + 1) + ":");
                    console.log("  ApprovalNo:", "'" + oHeader.ApprovalNo + "'");
                    console.log("  VendorCode:", "'" + oHeader.VendorCode + "'");
                    console.log("  Children:", oHeader.children ? oHeader.children.length : 0);

                    if (oHeader.children && oHeader.children.length > 0) {
                        oHeader.children.forEach(function (oChild, iChildIndex) {
                            console.log("  Child " + (iChildIndex + 1) + ":");
                            console.log("    ApprovalNo:", "'" + oChild.ApprovalNo + "'");
                            console.log("    VendorCode:", "'" + (oChild.VendorCode || oChild.VendorNumber) + "'");
                            console.log("    ItemNum:", "'" + oChild.ItemNum + "'");

                            // Test this specific item
                            if (iHeaderIndex === 0 && iChildIndex === 0) {
                                console.log("  Testing first child item...");
                                this.testSingleItemUpdate(oChild.ApprovalNo, oChild.VendorCode || oChild.VendorNumber);
                            }
                        }.bind(this));
                    }

                    if (iHeaderIndex === 0) return; // Only show first header for debugging
                }.bind(this));
            } else {
                console.log("No tree data available");
            }

            console.log("=================================");
        },

        // Method to inspect actual PaymentItemSet data structure
        inspectPaymentItemSetStructure: function () {
            var oModel = this.getView().getModel("oModel");

            console.log("=== INSPECTING PAYMENTITEMSET STRUCTURE ===");

            // Get first few items to see actual structure
            oModel.read("/PaymentItemSet", {
                urlParameters: {
                    "$top": "5"
                },
                success: function (oData) {
                    if (oData && oData.results && oData.results.length > 0) {
                        console.log("PaymentItemSet sample data (" + oData.results.length + " items):");
                        oData.results.forEach(function (oItem, iIndex) {
                            console.log("Item " + (iIndex + 1) + ":");
                            console.log("  ApprovalNo:", oItem.ApprovalNo);
                            console.log("  VendorCode:", oItem.VendorCode);
                            console.log("  VendorNumber:", oItem.VendorNumber);
                            console.log("  ItemNum:", oItem.ItemNum);
                            console.log("  TaxNum:", oItem.TaxNum);
                            console.log("  DocNum:", oItem.DocNum);
                            console.log("  All keys:", Object.keys(oItem).slice(0, 10)); // First 10 keys
                            console.log("  ---");
                        });

                        // Now try to read individual items with different key combinations
                        this._testIndividualItemReads(oModel, oData.results[0]);
                    } else {
                        console.log("No PaymentItemSet data found");
                    }
                }.bind(this),
                error: function (oError) {
                    console.error("Failed to read PaymentItemSet:", oError);
                }
            });

            console.log("==========================================");
        },

        _testIndividualItemReads: function (oModel, oSampleItem) {
            console.log("=== TESTING INDIVIDUAL ITEM READS ===");
            console.log("Using sample item:", {
                ApprovalNo: oSampleItem.ApprovalNo,
                VendorCode: oSampleItem.VendorCode,
                VendorNumber: oSampleItem.VendorNumber,
                ItemNum: oSampleItem.ItemNum
            });

            // Test different key combinations to see which one works for READ
            var aTestPaths = [
                "/PaymentItemSet(ApprovalNo='" + oSampleItem.ApprovalNo + "',VendorCode='" + oSampleItem.VendorCode + "')",
                "/PaymentItemSet(ApprovalNo='" + oSampleItem.ApprovalNo + "',VendorNumber='" + oSampleItem.VendorNumber + "')",
                "/PaymentItemSet(ApprovalNo='" + oSampleItem.ApprovalNo + "',ItemNum='" + oSampleItem.ItemNum + "')",
                "/PaymentItemSet('" + oSampleItem.ApprovalNo + "')",
                "/PaymentItemSet(ApprovalNo='" + oSampleItem.ApprovalNo + "')"
            ];

            aTestPaths.forEach(function (sPath, iIndex) {
                console.log("Testing READ path " + (iIndex + 1) + ": " + sPath);

                oModel.read(sPath, {
                    success: function (oData) {
                        console.log("✓ READ SUCCESS with path: " + sPath);
                        console.log("  Returned data keys:", Object.keys(oData).slice(0, 10));

                        // If READ works, try UPDATE with the same path
                        this._testUpdateWithWorkingPath(oModel, sPath, iIndex + 1);
                    }.bind(this),
                    error: function (oError) {
                        console.log("✗ READ FAILED with path: " + sPath + " - " + oError.message);
                    }
                });
            }.bind(this));
        },

        _testUpdateWithWorkingPath: function (oModel, sWorkingPath, iPathNumber) {
            console.log("=== TESTING UPDATE WITH WORKING READ PATH ===");
            console.log("Path " + iPathNumber + " worked for READ, trying UPDATE: " + sWorkingPath);

            var oTestUpdateData = {
                PmApprRemarks: "Test update at " + new Date().toISOString(),
                PmUserId: this._getCurrentUserId(),
                PmApprOn: new Date()
            };

            oModel.update(sWorkingPath, oTestUpdateData, {
                success: function (oData) {
                    console.log("✓ UPDATE SUCCESS with path: " + sWorkingPath);
                    console.log("This is the correct path structure for updates!");
                    MessageToast.show("Found working update path: " + sWorkingPath);
                },
                error: function (oError) {
                    console.log("✗ UPDATE FAILED with path: " + sWorkingPath + " - " + oError.message);
                }
            });
        },

        _tryFunctionImportApproach: function (oModel, aPayloadItems, sActionType, aSelectedItems) {
            // Check if there are any function imports available
            var oMetadata = oModel.getServiceMetadata();
            var aFunctionImports = [];

            if (oMetadata && oMetadata.dataServices && oMetadata.dataServices.schema) {
                oMetadata.dataServices.schema.forEach(function (oSchema) {
                    if (oSchema.entityContainer && oSchema.entityContainer[0] && oSchema.entityContainer[0].functionImport) {
                        aFunctionImports = oSchema.entityContainer[0].functionImport;
                    }
                });
            }

            console.log("Available Function Imports:", aFunctionImports);

            // Look for approval-related function imports
            var oApprovalFunction = aFunctionImports.find(function (oFunc) {
                var sName = oFunc.name.toLowerCase();
                return sName.includes('approval') || sName.includes('approve') || sName.includes('update') || sName.includes('process');
            });

            if (oApprovalFunction) {
                console.log("Found approval function import:", oApprovalFunction);
                this._callFunctionImport(oModel, oApprovalFunction, aPayloadItems, sActionType, aSelectedItems);
            } else {
                console.log("No approval function import found, trying CREATE approach");
                this._tryCreateApproach(oModel, aPayloadItems, sActionType, aSelectedItems);
            }
        },

        _callFunctionImport: function (oModel, oFunction, aPayloadItems, sActionType, aSelectedItems) {
            console.log("Calling function import:", oFunction.name);

            // Prepare parameters for function import
            var oParameters = {};

            // Add common parameters
            oParameters.Action = sActionType;
            oParameters.ProcessedBy = this._getCurrentUserId();
            oParameters.ItemCount = aPayloadItems.length.toString();

            // Add first item details as example (adjust based on your function import parameters)
                if (aPayloadItems.length > 0) {
                    var oFirstItem = aPayloadItems[0];
                    oParameters.ApprovalNo = oFirstItem.ApprovalNo;
                    oParameters.VendorCode = oFirstItem.VendorCode || oFirstItem.VendorNumber;
                    oParameters.PmApprStatus = oFirstItem.PmApprStatus;
                    oParameters.PmApprRemarks = oFirstItem.PmApprRemarks;
                    oParameters.ProfitCenter = oFirstItem.ProfitCenter;
                }

            console.log("Function import parameters:", oParameters);

            oModel.callFunction("/" + oFunction.name, {
                urlParameters: oParameters,
                success: function (oData) {
                    sap.ui.core.BusyIndicator.hide();
                    console.log("Function import call successful:", oData);
                    MessageToast.show("Items processed successfully via function import");
                }.bind(this),
                error: function (oError) {
                    console.error("Function import call failed:", oError);
                    this._tryCreateApproach(oModel, aPayloadItems, sActionType, aSelectedItems);
                }.bind(this)
            });
        },

        _tryCreateApproach: function (oModel, aPayloadItems, sActionType, aSelectedItems) {
            console.log("Trying CREATE approach for approval updates");

            // Since the backend doesn't support UPDATE operations, let's just update local model
            // and show a message that backend sync is not available

            console.log("=== BACKEND UPDATE NOT SUPPORTED ===");
            console.log("The OData service does not support UPDATE operations on PaymentItemSet");
            console.log("Method 'PAYMENTITEMSET_GET_ENTITY' not implemented indicates the service");
            console.log("is read-only or requires a different approach for updates.");
            console.log("Updating local model only.");
            console.log("====================================");

            sap.ui.core.BusyIndicator.hide();

            // Show message to user
            MessageToast.show(aPayloadItems.length + " items " +
                (sActionType === "APPROVE" ? "approved" : "rejected") +
                " locally. Backend service does not support updates.");

            // Log the payload that would have been sent
            console.log("=== PAYLOAD THAT WOULD BE SENT ===");
            aPayloadItems.forEach(function (oItem, iIndex) {
                console.log("Item " + (iIndex + 1) + ":", {
                    ApprovalNo: oItem.ApprovalNo,
                    VendorCode: oItem.VendorCode || oItem.VendorNumber,
                    PmApprStatus: oItem.PmApprStatus,
                    PmApprRemarks: oItem.PmApprRemarks,
                    PmApprAmt: oItem.PmApprAmt,
                    TdsAmount: oItem.TdsAmount,
                    Action: sActionType
                });
            });
            console.log("=================================");
        },

        _logBatchRequestDetails: function (oModel, aPayloadItems, sActionType) {
            var sServiceUrl = oModel.sServiceUrl || "";
            var sBatchUrl = sServiceUrl + "/$batch";
            var sBoundary = "batch_" + Date.now();

            console.log("=== BATCH REQUEST DETAILS ===");
            console.log("Service URL:", sServiceUrl);
            console.log("Batch URL:", sBatchUrl);
            console.log("Action:", sActionType);
            console.log("Items Count:", aPayloadItems.length);
            console.log("HTTP Method: POST");
            console.log("Content-Type: multipart/mixed; boundary=" + sBoundary);

            // Log headers that would be sent
            console.log("Expected Headers:", {
                "Content-Type": "multipart/mixed; boundary=" + sBoundary,
                "Accept": "application/json",
                "DataServiceVersion": "2.0",
                "X-Requested-With": "XMLHttpRequest"
            });

            // Generate the actual batch request body
            var sBatchBody = this._generateBatchRequestBody(aPayloadItems, sBoundary, sServiceUrl);
            console.log("=== BATCH REQUEST BODY ===");
            console.log(sBatchBody);
            console.log("=========================");

            // Log each item that would be in the batch
            console.log("Batch Items Summary:");
            aPayloadItems.forEach(function (oItem, iIndex) {
                var sPath = "/PaymentItemSet(ApprovalNo='" + oItem.ApprovalNo + "',VendorCode='" + (oItem.VendorCode || oItem.VendorNumber) + "')";
                console.log("  Item " + (iIndex + 1) + ":", {
                    Method: "PUT",
                    Path: sPath,
                    FullURL: sServiceUrl + sPath,
                    Data: {
                        PmApprAmt: oItem.PmApprAmt,
                        PmApprStatus: oItem.PmApprStatus,
                        PmApprRemarks: oItem.PmApprRemarks,
                        TdsAmount: oItem.TdsAmount
                    }
                });
            });
            console.log("=============================");
        },

        _generateBatchRequestBody: function (aPayloadItems, sBoundary, sServiceUrl) {
            var sCurrentUser = this._getCurrentUserId();
            var sBatchBody = "";

            aPayloadItems.forEach(function (oItem, iIndex) {
                var sPath = "/PaymentItemSet(ApprovalNo='" + oItem.ApprovalNo + "',VendorCode='" + (oItem.VendorCode || oItem.VendorNumber) + "')";
                var oUpdateData = {
                    PmApprAmt: oItem.PmApprAmt,
                    PmApprStatus: oItem.PmApprStatus,
                    PmApprRemarks: oItem.PmApprRemarks,
                    PmApprOn: new Date().toISOString(),
                    PmUserId: sCurrentUser,
                    TdsAmount: oItem.TdsAmount
                };

                sBatchBody += "--" + sBoundary + "\r\n";
                sBatchBody += "Content-Type: application/http\r\n";
                sBatchBody += "Content-Transfer-Encoding: binary\r\n";
                sBatchBody += "\r\n";
                sBatchBody += "PUT " + sPath + " HTTP/1.1\r\n";
                sBatchBody += "Content-Type: application/json\r\n";
                sBatchBody += "Accept: application/json\r\n";
                sBatchBody += "DataServiceVersion: 2.0\r\n";
                sBatchBody += "\r\n";
                sBatchBody += JSON.stringify(oUpdateData) + "\r\n";
            });

            sBatchBody += "--" + sBoundary + "--\r\n";

            return sBatchBody;
        },

        // Method to simulate the actual batch call
        _simulateBatchCall: function (aPayloadItems, sActionType) {
            var oModel = this.getView().getModel("oModel");
            var sServiceUrl = oModel.sServiceUrl || "";
            var sBatchUrl = sServiceUrl + "/$batch";
            var sBoundary = "batch_" + Date.now();
            var sBatchBody = this._generateBatchRequestBody(aPayloadItems, sBoundary, sServiceUrl);

            console.log("=== SIMULATED BATCH CALL ===");
            console.log("URL: POST " + sBatchUrl);
            console.log("Headers:");
            console.log("  Content-Type: multipart/mixed; boundary=" + sBoundary);
            console.log("  Accept: application/json");
            console.log("  DataServiceVersion: 2.0");
            console.log("  X-Requested-With: XMLHttpRequest");
            console.log("");
            console.log("Request Body:");
            console.log(sBatchBody);
            console.log("============================");

            // You can copy this information to test with tools like Postman
            return {
                url: sBatchUrl,
                method: "POST",
                headers: {
                    "Content-Type": "multipart/mixed; boundary=" + sBoundary,
                    "Accept": "application/json",
                    "DataServiceVersion": "2.0",
                    "X-Requested-With": "XMLHttpRequest"
                },
                body: sBatchBody
            };
        },

        _logIndividualRequestDetails: function (sPath, oUpdateData, iItemNumber) {
            var oModel = this.getView().getModel("oModel");
            var sServiceUrl = oModel.sServiceUrl || "";
            var sFullUrl = sServiceUrl + sPath;

            console.log("=== INDIVIDUAL REQUEST " + iItemNumber + " ===");
            console.log("Method: PUT");
            console.log("URL:", sFullUrl);
            console.log("Path:", sPath);
            console.log("Headers:", {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "DataServiceVersion": "2.0",
                "X-Requested-With": "XMLHttpRequest",
                "X-HTTP-Method": "PUT"
            });
            console.log("Payload:", JSON.stringify(oUpdateData, null, 2));
            console.log("Raw Payload:", oUpdateData);
            console.log("================================");
        },

        formatDialogStatusState: function (bIsHeader, sOverallStatus, sPmApprStatus) {
            // choose status based on header/item
            var sStatus = (bIsHeader ? sOverallStatus : sPmApprStatus) || "";
            sStatus = sStatus.trim().toUpperCase();

            // map your backend statuses to ValueState
            // change these values to match your actual statuses
            if (sStatus === "APPROVED" || sStatus === "APPROVE" || sStatus === "PM_APPR") {
                return "Success";
            }

            if (sStatus === "REJECTED" || sStatus === "REJECT" || sStatus === "PM_REJ") {
                return "Error";
            }

            if (sStatus === "PENDING" || sStatus === "INPROCESS" || sStatus === "IN PROCESS") {
                return "Warning";
            }

            return "None";
        },

        formatDialogAmount: function (bIsHeader, sTotalAmount, sItemAmount, sCurrency) {
            var sAmount = bIsHeader ? sTotalAmount : sItemAmount;
            if (!sAmount || sAmount === "" || isNaN(parseFloat(sAmount))) {
                return "₹0.00";
            }

            var numericValue = parseFloat(sAmount);
            return "₹" + numericValue.toLocaleString('en-IN', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
        },

        formatDialogStatusText: function (bIsHeader, sOverallStatus, sPmApprStatus) {
            return bIsHeader ? (sOverallStatus || "PENDING") : (sPmApprStatus || "PENDING");
        },


        // Formatter functions
        // Formatter functions
        formatter: {
            formatCurrency: function (value, showInLakhs) {
                if (!value || value === "" || isNaN(parseFloat(value))) {
                    return "₹0.00";
                }

                var numericValue = parseFloat(value);

                if (showInLakhs) {
                    if (numericValue >= 100000) {
                        // Convert to lakhs (1 lakh = 100,000)
                        var lakhValue = numericValue / 100000;
                        return "₹" + lakhValue.toFixed(2) + "L";
                    } else if (numericValue >= 1000) {
                        // Show in thousands for smaller amounts
                        var thousandValue = numericValue / 1000;
                        return "₹" + thousandValue.toFixed(2) + "K";
                    } else {
                        // Show as is for very small amounts
                        return "₹" + numericValue.toFixed(2);
                    }
                } else {
                    // Display in rupees with proper formatting
                    return "₹" + numericValue.toLocaleString('en-IN', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    });
                }
            },

            formatIndianCurrency: function (value) {
                if (!value || value === "" || isNaN(value)) {
                    return "₹0.00";
                }

                var numericValue = parseFloat(value);
                if (isNaN(numericValue)) {
                    return "₹0.00";
                }

                var displayValue = numericValue;
                var suffix = "";

                if (numericValue >= 100000) {
                    displayValue = numericValue / 100000;
                    suffix = "L";
                } else if (numericValue >= 1000) {
                    displayValue = numericValue / 1000;
                    suffix = "K";
                }

                return "₹" + displayValue.toFixed(2) + suffix;
            },

            statusState: function (status) {
                if (!status) return ValueState.None;

                switch (status.toUpperCase()) {
                    case "APPROVED":
                    case "COMPLETE":
                    case "SUCCESS":
                        return ValueState.Success;
                    case "REJECTED":
                    case "CANCELLED":
                    case "ERROR":
                        return ValueState.Error;
                    case "PENDING":
                    case "IN_PROCESS":
                    case "WARNING":
                        return ValueState.Warning;
                    case "INFORMATION":
                    case "INFO":
                        return ValueState.Information;
                    default:
                        return ValueState.None;
                }
            }
        }
    });
});