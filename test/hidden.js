var assert = require('assert');
var Backbone = require('./cordedbackbone');

describe('hidden plugin', function() {
	var view;
	before(function() {
		view = new (Backbone.View.extend({
			el: function(h) {
				return h('',
						h('#whenfalse', {hidden: '!_value'}, 'Visible when false'),
						h('#whentrue', {hidden: '_value'}, 'Visible when true')
					);
			},
			properties: {
				value: false
			}
		}))();
	});
	describe('HiddenElementsView value false', function() {
		it('#whenfalse should be hidden', function() { assert.equal(view.whenfalse.style.display, 'none'); });
		it('#whentrue should not be hidden', function() { assert.notEqual(view.whentrue.style.display, 'none'); });
	});
	describe('HiddenElementsView value true', function() {
		before(function() { view.value = true; });
		it('#whenfalse should not be hidden', function() { assert.notEqual(view.whenfalse.style.display, 'none'); });
		it('#whentrue should be hidden', function() { assert.equal(view.whentrue.style.display, 'none'); });
	});
});
