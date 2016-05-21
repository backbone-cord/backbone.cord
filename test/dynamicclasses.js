var assert = require('assert');

describe('dynamicclasses plugin', function() {
	var view;
	before(function() {
		var Backbone = require('./cordedbackbone');
		view = new (Backbone.View.extend({
			el: function(h) {
				return h('.{_value}');
			},
			properties: {
				value: 'one'
			}
		}))();
	});
	describe('value is one', function() {
		it('el.className should contain one', function() { assert.notEqual(view.el.className.indexOf('one'), -1); });
	});
	describe('value is two', function() {
		before(function() { view.value = 'two'; });
		it('el.className should contain two', function() { assert.notEqual(view.el.className.indexOf('two'), -1); });
	});
});
