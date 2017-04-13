const assert = require('assert');
const Backbone = require('./cordedbackbone');
const h = Backbone.Cord.h;

describe('filters', () => {
	let view;
	before(() => {
		Backbone.Cord.filters['plus100'] = (value) => {
			return value + 100;
		};
		Backbone.Cord.filters['reverse'] = (value) => {
			return value.split('').reverse().join('');
		};
		view = new (Backbone.View.extend({
			el() {
				return h('', {'data-reverse': '[name|reverse]', 'data-lower': '[name|lower]', 'data-upper': '[name|upper]', 'data-title': '[name|title]'}, '[value|abs] [value|plus100]');
			},
			properties: {
				value: 1,
				name: 'test'
			}
		}))();
	});
	describe('value is 1', () => {
		it('textContent should be "1 101"', () => assert.equal(view.el.textContent, '1 101'));
	});
	describe('value is 2', () => {
		before(() => { view.value = 2; });
		it('textContent should be "2 102"', () => assert.equal(view.el.textContent, '2 102'));
	});
	describe('value is -22', () => {
		before(() => { view.value = -22; });
		it('textContent should be "22 78"', () => assert.equal(view.el.textContent, '22 78'));
	});
	describe('name is test', () => {
		it('data-reverse should be "tset"', () => assert.equal(view.el.getAttribute('data-reverse'), 'tset'));
		it('data-lower should be "test"', () => assert.equal(view.el.getAttribute('data-lower'), 'test'));
		it('data-upper should be "TEST"', () => assert.equal(view.el.getAttribute('data-upper'), 'TEST'));
		it('data-title should be "Test"', () => assert.equal(view.el.getAttribute('data-title'), 'Test'));
	});
	describe('name is Jim-Bob computer repair', () => {
		before(() => { view.name = 'Jim-bob computer repair'; });
		it('data-reverse should be "riaper retupmoc bob-miJ"', () => assert.equal(view.el.getAttribute('data-reverse'), 'riaper retupmoc bob-miJ'));
		it('data-lower should be "jim-bob computer repair"', () => assert.equal(view.el.getAttribute('data-lower'), 'jim-bob computer repair'));
		it('data-upper should be "JIM-BOB COMPUTER REPAIR"', () => assert.equal(view.el.getAttribute('data-upper'), 'JIM-BOB COMPUTER REPAIR'));
		it('data-title should be "Jim-Bob Computer Repair"', () => assert.equal(view.el.getAttribute('data-title'), 'Jim-Bob Computer Repair'));
	});
});
