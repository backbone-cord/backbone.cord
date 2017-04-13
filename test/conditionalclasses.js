const assert = require('assert');
const Backbone = require('./cordedbackbone');
const h = Backbone.Cord.h;

describe('conditional classes', () => {
	let view;
	before(() => {
		view = new (Backbone.View.extend({
			el() {
				return h('.red(value)');
			},
			properties: {
				value: 'one'
			}
		}))();
	});
	describe('value is "one"', () => {
		it('el.className should contain red', () => assert.notEqual(view.el.className.indexOf('red'), -1));
	});
	describe('value is 2', () => {
		before(() => { view.value = 2; });
		it('el.className should contain red', () => assert.notEqual(view.el.className.indexOf('red'), -1));
	});
	describe('value is {}', () => {
		before(() => { view.value = {}; });
		it('el.className should contain red', () => assert.notEqual(view.el.className.indexOf('red'), -1));
	});
	describe('value is null', () => {
		before(() => { view.value = null; });
		it('el.className should not contain red', () => assert.equal(view.el.className.indexOf('red'), -1));
	});
	describe('value is []', () => {
		before(() => { view.value = []; });
		it('el.className should not contain red', () => assert.equal(view.el.className.indexOf('red'), -1));
	});
	describe('value is ""', () => {
		before(() => { view.value = ''; });
		it('el.className should not contain red', () => assert.equal(view.el.className.indexOf('red'), -1));
	});
});
