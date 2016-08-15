var assert = require('assert');
var Backbone = require('./cordedbackbone');

describe('subkeys', function() {
	var view;
	before(function() {
		view = new (Backbone.View.extend({
			el: function(h) {
				return h('', '{_obj.a} {_obj.b}');
			},
			properties: {
				obj: {
					value: {a: 1, b: 2}
				}
			}
		}))();
	});
	describe('obj.a and obj.b is 1 and 2', function() {
		it('textContent should be "1 2"', function() { assert.equal(view.el.textContent, '1 2'); });
	});
});
