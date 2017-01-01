var assert = require('assert');
var Backbone = require('./cordedbackbone');

describe('dynamic classes', function() {
	var view;
	before(function() {
		view = new (Backbone.View.extend({
			el: function(h) {
				return h('.{value}');
			},
			properties: {
				value: 'one'
			}
		}))();
	});
	describe('value is "one"', function() {
		before(function() { view.value = 'one'; });
		it('el.className should contain one', function() { assert.notEqual(view.el.className.indexOf('one'), -1); });
	});
	describe('value is "two"', function() {
		before(function() { view.value = 'two'; });
		it('el.className should contain two', function() { assert.notEqual(view.el.className.indexOf('two'), -1); });
	});
});
