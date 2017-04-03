var assert = require('assert');
var Backbone = require('./cordedbackbone');

describe('basic validation', function() {
	describe('int equals, min, max validation', function() {
		it('1 equals 1 should validate', function() { assert.equal(Backbone.Cord.validate(1, {type: 'int', equals: 1}), true); });
		it('1 equals [3, 2, 1] should validate', function() { assert.equal(Backbone.Cord.validate(1, {type: 'int', equals: [3, 2, 1]}), true); });
		it('1 equals {1: "test"} should validate', function() { assert.equal(Backbone.Cord.validate(1, {type: 'int', equals: {1: "test"}}), true); });
		it('1 min of 1 should validate', function() { assert.equal(Backbone.Cord.validate(1, {type: 'int', min: 1, max: 10}), true); });
		it('1 max of 10 should validate', function() { assert.equal(Backbone.Cord.validate(1, {type: 'int', min: 1, max: 10}), true); });
		it('null should validate', function() { assert.equal(Backbone.Cord.validate(null, {type: 'int'}), true); });

		it('1 equals 2 should not validate', function() { assert.equal(Backbone.Cord.validate(1, {type: 'int', equals: 2}), 'equals'); });
		it('-1 min of 1 should not validate', function() { assert.equal(Backbone.Cord.validate(-1, {type: 'int', min: 1, max: 10}), 'min'); });
		it('100 max of 10 should not validate', function() { assert.equal(Backbone.Cord.validate(100, {type: 'int', min: 1, max: 10}), 'max'); });
		it('null but required should not validate', function() { assert.equal(Backbone.Cord.validate(null, {type: 'int', required: true}), 'required'); });
	});
	describe('string equals, min, max validation', function() {
		it('"dog" equals "dog" should validate', function() { assert.equal(Backbone.Cord.validate("dog", {type: 'string', equals: "dog"}), true); });
		it('"dog" equals ["dog", "test"] should validate', function() { assert.equal(Backbone.Cord.validate("dog", {type: 'string', equals: ["dog", "test"]}), true); });
		it('"dog" equals {"dog": "test"} should validate', function() { assert.equal(Backbone.Cord.validate("dog", {type: 'string', equals: {"dog": "test"}}), true); });
		it('"dog" min 3 should validate', function() { assert.equal(Backbone.Cord.validate("dog", {type: 'string', min: 3, max: 6}), true); });
		it('"dog" max 6 should validate', function() { assert.equal(Backbone.Cord.validate("dog", {type: 'string', max: 3, max: 6}), true); });
		it('null should validate', function() { assert.equal(Backbone.Cord.validate(null, {type: 'string'}), true); });
		it('"" should validate', function() { assert.equal(Backbone.Cord.validate("", {type: 'string'}), true); });

		it('"dog" equals "doggy" should not validate', function() { assert.equal(Backbone.Cord.validate("dog", {type: 'string', equals: "doggy"}), 'equals'); });
		it('"d" min 3 should not validate', function() { assert.equal(Backbone.Cord.validate("d", {type: 'string', min: 3, max: 6}), 'min'); });
		it('"dogdogdog" max 6 should not validate', function() { assert.equal(Backbone.Cord.validate("dogdogdog", {type: 'string', max: 3, max: 6}), 'max'); });
		it('null but required should not validate', function() { assert.equal(Backbone.Cord.validate(null, {type: 'string', required: true}), 'required'); });
		it('"" but required should not validate', function() { assert.equal(Backbone.Cord.validate("", {type: 'string', required: true}), 'required'); });
	});
	describe('string formats', function() {
		it('custom function format should validate', function() { assert.equal(Backbone.Cord.validate("dog", {type: 'string', format: function(value) { return value[0] === 'd'; }}), true); });
		it('custom regex format should validate', function() { assert.equal(Backbone.Cord.validate("dog", {type: 'string', format: /^d.*/}), true); });
		it('custom function format should not validate', function() { assert.equal(Backbone.Cord.validate("oog", {type: 'string', format: function(value) { return value[0] === 'd'; }}), 'format'); });
		it('custom regex format should not validate', function() { assert.equal(Backbone.Cord.validate("oog", {type: 'string', format: /^d.*/}), 'format'); });

		it('url format tests', function() {
			var i;
			var passURLs = [
				'https://www.yahoo.com',
				'https://www.example.com#hash?args1=234',
				'www.yahoo.com',
				'https://weather.com/weather/today/l/USNY0996:1:US'
			];
			var failURLs = [
				'//www.yahoo.com',
				'ftp://www.yahoo.com'
			];
			for(i = 0; i < passURLs.length; ++i) {
				assert.equal(Backbone.Cord.validate(passURLs[i], {type: 'string', format: 'url'}), true, passURLs[i]);
			}
			for(i = 0; i < failURLs.length; ++i) {
				assert.equal(Backbone.Cord.validate(failURLs[i], {type: 'string', format: 'url'}), 'format', failURLs[i]);
			}
		});
		it('email format tests', function() {
			var i;
			var passEmails = [
				'example@example.com',
				'example@example.co',
				'EXAMPLE@example.com',
				'example@example.ly',
				'ex-ample@example.ly',
				'ex_ample@example.ly',
				'Ex.Ample@example.ly',
				'Ex.Ample@example.com.au'
			];
			var failEmails = [
				'Abc.example.com',
				'A@b@c@example.com',
				'example.example.com',
				'example@example!com',
				'<example@example.com>',
				'(ex)ample@example.com.com.com'
			];
			for(i = 0; i < passEmails.length; ++i) {
				assert.equal(Backbone.Cord.validate(passEmails[i], {type: 'string', format: 'email'}), true, passEmails[i]);
			}
			for(i = 0; i < failEmails.length; ++i) {
				assert.equal(Backbone.Cord.validate(failEmails[i], {type: 'string', format: 'email'}), 'format', failEmails[i]);
			}
		});
		it('username format tests', function() {
			var i;
			var passUsernames = [
				'example',
				'EXAMPLE',
				'ex-ample',
				'ex_ample'
			];
			var failUsernames = [
				'Ex%Ample',
				'$example'
			];
			for(i = 0; i < passUsernames.length; ++i) {
				assert.equal(Backbone.Cord.validate(passUsernames[i], {type: 'string', format: 'username'}), true, passUsernames[i]);
			}
			for(i = 0; i < failUsernames.length; ++i) {
				assert.equal(Backbone.Cord.validate(failUsernames[i], {type: 'string', format: 'username'}), 'format', failUsernames[i]);
			}
		});
		it('color format tests', function() {
			var i;
			var passColors = [
				'#aaa',
				'#aaaaaa',
				'#AAAAAA',
				'#af02d6'
			];
			var failColors = [
				'#HHHHHH',
				'#aaaaa',
				'test'
			];
			for(i = 0; i < passColors.length; ++i) {
				assert.equal(Backbone.Cord.validate(passColors[i], {type: 'string', format: 'color'}), true, passColors[i]);
			}
			for(i = 0; i < failColors.length; ++i) {
				assert.equal(Backbone.Cord.validate(failColors[i], {type: 'string', format: 'color'}), 'format', failColors[i]);
			}
		});
		it('ip format tests', function() {
			var i;
			var passIPs = [
				'1.1.1.1',
				'127.0.0.1',
				'255.255.255.255',
				'12.78.2.1'
			];
			var failIPs = [
				'1.1.1',
				'127.0.0.256',
				'12.78',
				'12.78.2..1',
				'12.78.2.a'
			];
			for(i = 0; i < passIPs.length; ++i) {
				assert.equal(Backbone.Cord.validate(passIPs[i], {type: 'string', format: 'ip'}), true, passIPs[i]);
			}
			for(i = 0; i < failIPs.length; ++i) {
				assert.equal(Backbone.Cord.validate(failIPs[i], {type: 'string', format: 'ip'}), 'format', failIPs[i]);
			}
		});
	});
});
