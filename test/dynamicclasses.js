const assert = require('assert');
const Backbone = require('./cordedbackbone');
const h = Backbone.Cord.h;

describe('dynamic classes', () => {
	let view;
	before(() => {
		view = new (Backbone.View.extend({
			el() {
				return h('.[value]');
			},
			properties: {
				value: 'one'
			}
		}))();
	});
	describe('value is "one"', () => {
		before(() => { view.value = 'one'; });
		it('el.className should contain one', () => assert.notEqual(view.el.className.indexOf('one'), -1));
	});
	describe('value is "two"', () => {
		before(() => { view.value = 'two'; });
		it('el.className should contain two', () => assert.notEqual(view.el.className.indexOf('two'), -1));
	});
});
