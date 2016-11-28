var assert = require('assert');
var Backbone = require('./cordedbackbone');

describe('binding plugin', function() {
	var view;
	before(function() {
		view = new (Backbone.View.extend({
			el: function(h) {
				return h('', '{value}',
						h('#onevalue', '{value}'),
						h('#withattrs', {'data-value': '{value}'}),
						h('#twovalues', '{value1} {value2}')
						);
			},
			properties: {
				value: 'test',
				value1: 'one',
				value2: 'two'
			}
		}))();
	});
	describe('text nodes', function() {
		it('#onevalue.textContent should contain "test"', function() { assert.equal(view.onevalue.textContent, 'test'); });
		it('#twovalues.textContent should contain "one two"', function() { assert.equal(view.twovalues.textContent, 'one two'); });
	});
	describe('attributes', function() {
		it('#withattrs.data-value should contain "test"', function() { assert.equal(view.withattrs.getAttribute('data-value'), 'test'); });
	});
	describe('text nodes when values change', function() {
		before(function() {
			view.value = 'tset';
			view.value1 = '1';
			view.value2 = '2';
		});
		it('#onevalue.textContent should contain "tset"', function() { assert.equal(view.onevalue.textContent, 'tset'); });
		it('#twovalues.textContent should contain "1 2"', function() { assert.equal(view.twovalues.textContent, '1 2'); });
	});
});
