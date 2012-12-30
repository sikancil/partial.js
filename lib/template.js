// Copyright Peter Širka, Web Site Design s.r.o. (www.petersirka.sk)
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

exports.version = "1.0.1";

var utils = require('./utils');
var path = require('path');
var fs = require('fs');
var util = require('util');
var utils = require('./utils');
var internal = require('./internal');

function Template(subscribe, id, prefix, model, cb) {
	this.subscribe = subscribe;
	this.app = subscribe.app;
	this.id = id;
	this.name = '';
	this.prefix = prefix;
	this.model = util.isArray(model) ? model : [];
	this.callback = cb;
	this.state = 0;

	if (model != null && !util.isArray(model))
		this.model = [model];

	this.template = '';
	this.builder = [];

	// auto parse, auto run
	this.init = function(name, nameEmpty) {

		var fileName = name;
		self.state = 2;

		if (self.model == null || self.model.length === 0) {
			fileName = nameEmpty || '';
			self.state = 1;
		}

		var reg = new RegExp('{.*?}', 'gi');
		var match = reg.exec(fileName);

		if (match != null) {
			self.template = fileName;
			fileName = match[0].toString().replace('{', '').replace('}', '');
			self.name = fileName;
		}

		self.load(fileName, self.prefix);
	};

	// load template from file
	this.load = function(name, prefix) {
		var key = 'template.' + name + (prefix.length > 0 ? '#' + prefix : prefix);

		// čítanie z Cache (async)
		self.app.cache.read(key, function(data) {

			if (data == null) {
				parseFromFile(key, name, prefix);
				return;
			}

			onTemplate(data);
		});
	};

	function parseFromFile(key, name, prefix) {

		var fileName = utils.combine(self.app.options.directoryTemplates, name + prefix + '.html');

		var callback = function(data) {
			
			if (data == null) {
				// odstraňujeme prefix
				self.load(name, '', onTemplate);
				return;
			}

			var template = typeof(data) === 'string' ? data : data.toString('utf8');
			var matches = template.match(/\{[\w\(\)]+\}/g);

			// vytvorenie cache objektu
			var tmp = parseTemplate(template);
			var obj = { data: tmp.template, between: tmp.between, matches: matches };

			// if debug == no cache
			if (self.app.options.debug) {
				onTemplate(obj);
				return;
			}

			self.app.cache.write(key, obj, new Date().add('m', 1), function(cacheData) {
				// voláme spracovanie template-tu
				onTemplate(cacheData);
			});			
		};

		utils.loadFromFile(fileName, callback, prefix != '' ? null : ''); 
	};

	function parseTemplate(html) {
		var indexBeg = html.indexOf('<!--');
		if (indexBeg === -1)
			return { template: html, between: '' };
		
		var indexEnd = html.lastIndexOf('-->')
		if (indexEnd === -1)
			return { template: html, between: '' };

		return { template: html.substring(indexBeg + 4, indexEnd).trim(), between: html.substring(0, indexBeg) + '@@@' + html.substring(indexEnd + 3) };
	};

	function onTemplate(obj) {

		var data = obj.data;
		var matches = obj.matches;		
		var reg = new RegExp('\{' + self.name + '\}', 'g');

		// isEmpty? vraciame šablonu
		if (self.state === 1) {
			self.callback(self.id, self.template.length > 0 ? self.template.replace(reg, data) : data);
			return;
		}

		if (matches == null) {
			self.callback(self.id, '');
			return;
		}

		// model forEach
		// rewrite to async
		self.model.forEach(function(o) {
			
			var str = data;
			matches.forEach(function(prop) {

				var isEncode = false;
				var name = prop.replace(/\s/g, '');

				if (prop.substring(0, 2) === '{!') {
					name = name.substring(2);
					name = name.substring(0, name.length - 2);
				} else {
					name = name.substring(1);
					name = name.substring(0, name.length - 1);
					isEncode = true;
				}

				var val = o[name];

				if (typeof(val) === 'undefined')
					return;

				val = val.toString();
				str = str.replace(prop, isEncode ? utils.htmlEncode(val) : val);
			});

			self.builder.push(str);
		});

		var output = obj.between.length > 0 ? obj.between.replace('@@@', self.builder.join('')) : self.builder.join('');
		self.callback(self.id, self.template.length > 0 ? self.template.replace(reg, output) : output);
	};

	var self = this;
};

module.exports.render = function(subscribe, id, name, nameEmpty, prefix, model, cb) {
	var template = new Template(subscribe, id, prefix, model, cb);
	template.init(name, nameEmpty);
};