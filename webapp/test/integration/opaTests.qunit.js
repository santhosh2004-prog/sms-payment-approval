/* global QUnit */
QUnit.config.autostart = false;

sap.ui.require(["com/incresol/zpaymentworkflow/test/integration/AllJourneys"
], function () {
	QUnit.start();
});
