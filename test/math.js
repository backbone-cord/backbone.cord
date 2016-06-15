var assert = require('assert');
var Backbone = require('./cordedbackbone');

describe('math plugin', function() {
	var view;
	before(function() {
		view = new (Backbone.View.extend({
			el: function(h) {
				return h('',
						h('', '100 added to value is ',
							h('#add', ':=100 + {_value}=:')),
						h('', 'value divided by 2 is ',
							h('#divide', ':={_value}/2=:'))
					);
			},
			properties: {
				value: 2
			}
		}))();
	});
	describe('value is 2', function() {
		it('#add should be 102', function() { assert.equal(view.add.textContent, '102'); });
		it('#divide should be 1', function() { assert.equal(view.divide.textContent, '1'); });
	});
	describe('value is 33', function() {
		before(function() { view.value = 33; });
		it('#add should be 133', function() { assert.equal(view.add.textContent, '133'); });
		it('#divide should be 16.5', function() { assert.equal(view.divide.textContent, '16.5'); });
	});
});
