const assert = require('assert');
const Backbone = require('./cordedbackbone');
const h = Backbone.Cord.h;

describe('subkeys', () => {
	let view;
	before(() => {
		view = new (Backbone.View.extend({
			el() {
				return h('', '[obj.a] [obj.b]');
			},
			properties: {
				obj: {
					value: {a: 1, b: 2}
				}
			}
		}))();
	});
	describe('obj.a and obj.b is 1 and 2', () => {
		it('textContent should be "1 2"', () => assert.equal(view.el.textContent, '1 2'));
	});
});
