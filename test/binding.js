const assert = require('assert');
const Backbone = require('./cordedbackbone');
const h = Backbone.Cord.h;

describe('binding plugin', function() {
	let view;
	before(function() {
		view = new (Backbone.View.extend({
			el() {
				return h('', '[value]',
					h('#onevalue', '[value]'),
					h('#withattrs', {'data-value': '[value]'}),
					h('#twovalues', '[value1] [value2]')
				);
			},
			properties: {
				value: 'test',
				value1: 'one',
				value2: 'two'
			}
		}))();
	});
	describe('text nodes', () => {
		it('#onevalue.textContent should contain "test"', () => assert.equal(view.onevalue.textContent, 'test'));
		it('#twovalues.textContent should contain "one two"', () => assert.equal(view.twovalues.textContent, 'one two'));
	});
	describe('attributes', () => {
		it('#withattrs.data-value should contain "test"', () => assert.equal(view.withattrs.getAttribute('data-value'), 'test'));
	});
	describe('text nodes when values change', () => {
		before(() => {
			view.value = 'tset';
			view.value1 = '1';
			view.value2 = '2';
		});
		it('#onevalue.textContent should contain "tset"', () => assert.equal(view.onevalue.textContent, 'tset'));
		it('#twovalues.textContent should contain "1 2"', () => assert.equal(view.twovalues.textContent, '1 2'));
	});
});
