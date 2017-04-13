const assert = require('assert');
const Backbone = require('./cordedbackbone');
const h = Backbone.Cord.h;

describe('hidden plugin', () => {
	let view;
	before(() => {
		view = new (Backbone.View.extend({
			el() {
				return h('',
						h('#whenfalse', {hidden: '!value'}, 'Visible when false'),
						h('#whentrue', {hidden: 'value'}, 'Visible when true')
					);
			},
			properties: {
				value: false
			}
		}))();
	});
	describe('HiddenElementsView value false', () => {
		it('#whenfalse should be hidden', () => assert.equal(view.whenfalse.style.display, 'none'));
		it('#whentrue should not be hidden', () => assert.notEqual(view.whentrue.style.display, 'none'));
	});
	describe('HiddenElementsView value true', () => {
		before(() => { view.value = true; });
		it('#whenfalse should not be hidden', () => assert.notEqual(view.whenfalse.style.display, 'none'));
		it('#whentrue should be hidden', () => assert.equal(view.whentrue.style.display, 'none'));
	});
});
