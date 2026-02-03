/*global QUnit*/

sap.ui.define([
	"com/incresol/zpaymentworkflow/controller/ProjectManager.controller"
], function (Controller) {
	"use strict";

	QUnit.module("ProjectManager Controller");

	QUnit.test("I should test the ProjectManager controller", function (assert) {
		var oAppController = new Controller();
		oAppController.onInit();
		assert.ok(oAppController);
	});

});
