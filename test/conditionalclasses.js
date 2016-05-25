var assert = require('assert');
var Backbone = require('./cordedbackbone');

describe('conditionalclasses plugin', function() {
	var view;
	before(function() {
		view = new (Backbone.View.extend({
			el: function(h) {
				return h('.red(_value)');
			},
			properties: {
				value: 'one'
			}
		}))();
	});
	describe('value is "one"', function() {
		it('el.className should contain red', function() { assert.notEqual(view.el.className.indexOf('red'), -1); });
	});
	describe('value is 2', function() {
		before(function() { view.value = 2; });
		it('el.className should contain red', function() { assert.notEqual(view.el.className.indexOf('red'), -1); });
	});
	describe('value is {}', function() {
		before(function() { view.value = {}; });
		it('el.className should contain red', function() { assert.notEqual(view.el.className.indexOf('red'), -1); });
	});
	describe('value is null', function() {
		before(function() { view.value = null; });
		it('el.className should not contain red', function() { assert.equal(view.el.className.indexOf('red'), -1); });
	});
	describe('value is []', function() {
		before(function() { view.value = []; });
		it('el.className should not contain red', function() { assert.equal(view.el.className.indexOf('red'), -1); });
	});
	describe('value is ""', function() {
		before(function() { view.value = ''; });
		it('el.className should not contain red', function() { assert.equal(view.el.className.indexOf('red'), -1); });
	});
});
