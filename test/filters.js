var assert = require('assert');

describe('filters', function() {
	var view;
	before(function() {
		var Backbone = require('./cordedbackbone');
		Backbone.Cord.filters['plus100'] = function(value) {
			return value + 100;
		};
		Backbone.Cord.filters['reverse'] = function(value) {
			return value.split('').reverse().join('');
		};
		view = new (Backbone.View.extend({
			el: function(h) {
				return h('', {'data-name': '{_name|reverse}'}, '{_value} {_value|plus100}');
			},
			properties: {
				value: 1,
				name: 'test'
			}
		}))();
	});
	describe('value is 1', function() {
		it('textContent should be "1 101"', function() { assert.equal(view.el.textContent, '1 101'); });
	});
	describe('value is 2', function() {
		before(function() { view.value = 2; });
		it('textContent should be "2 102"', function() { assert.equal(view.el.textContent, '2 102'); });
	});
	describe('name is test', function() {
		it('data-name should be "tset"', function() { assert.equal(view.el.getAttribute('data-name'), 'tset'); });
	});
	describe('name is computer', function() {
		before(function() { view.name = 'computer'; });
		it('data-name should be "retupmoc"', function() { assert.equal(view.el.getAttribute('data-name'), 'retupmoc'); });
	});
});
