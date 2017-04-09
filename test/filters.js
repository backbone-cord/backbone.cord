var assert = require('assert');
var Backbone = require('./cordedbackbone');

describe('filters', function() {
	var view;
	before(function() {
		Backbone.Cord.filters['plus100'] = function(value) {
			return value + 100;
		};
		Backbone.Cord.filters['reverse'] = function(value) {
			return value.split('').reverse().join('');
		};
		view = new (Backbone.View.extend({
			el: function(h) {
				return h('', {'data-reverse': '[name|reverse]', 'data-lower': '[name|lower]', 'data-upper': '[name|upper]', 'data-title': '[name|title]'}, '[value|abs] [value|plus100]');
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
	describe('value is -22', function() {
		before(function() { view.value = -22; });
		it('textContent should be "22 78"', function() { assert.equal(view.el.textContent, '22 78'); });
	});
	describe('name is test', function() {
		it('data-reverse should be "tset"', function() { assert.equal(view.el.getAttribute('data-reverse'), 'tset'); });
		it('data-lower should be "test"', function() { assert.equal(view.el.getAttribute('data-lower'), 'test'); });
		it('data-upper should be "TEST"', function() { assert.equal(view.el.getAttribute('data-upper'), 'TEST'); });
		it('data-title should be "Test"', function() { assert.equal(view.el.getAttribute('data-title'), 'Test'); });
	});
	describe('name is Jim-Bob computer repair', function() {
		before(function() { view.name = 'Jim-bob computer repair'; });
		it('data-reverse should be "riaper retupmoc bob-miJ"', function() { assert.equal(view.el.getAttribute('data-reverse'), 'riaper retupmoc bob-miJ'); });
		it('data-lower should be "jim-bob computer repair"', function() { assert.equal(view.el.getAttribute('data-lower'), 'jim-bob computer repair'); });
		it('data-upper should be "JIM-BOB COMPUTER REPAIR"', function() { assert.equal(view.el.getAttribute('data-upper'), 'JIM-BOB COMPUTER REPAIR'); });
		it('data-title should be "Jim-Bob Computer Repair"', function() { assert.equal(view.el.getAttribute('data-title'), 'Jim-Bob Computer Repair'); });
	});
});
