/**
 * 抓取程序
 */

var http = require('http');
var util = require('util');
var fs = require('fs');
var zlib = require('zlib');
var jsdom = require('jsdom');
var url = require('url');
var crypto = require('crypto');
jsdom.defaultDocumentFeatures = {
		FetchExternalResources: ["script"],
		ProcessExternalResources: false
};

var page_num = 0;
var total_page_num = 0;

var jd_urls = [];
var jds = [];

function parseOnePage(doc) {
	var selector = "td a";
	var elements = doc.querySelectorAll(selector);
	console.log('find '  + elements.length + ' job url');
	for (var i = 0; i < elements.length; i++) {
		var element = elements[i];
		jd_urls[jd_urls.length] = element.href;
	}
}

function createLocalJDFile() {
	var target_keyword = ['工程师', 'JAVA', 'C', 'PHP', '前端', '后台', '运维', 'CSS', '搜索', '架构'];
	var target_jds = [];
	var max_jd = 12;
	for (var i = 0; i < jds.length && target_jds.length < max_jd; i++) {
		var jd = jds[i];
		var name = jd.name;
		var upper_name = name.toUpperCase();
		var is_target = false;
		for (var j = 0; j < target_keyword.length; j++) {
			var keyword = target_keyword[j];
			if (upper_name.indexOf(keyword) >= 0) {
				is_target = true;
				break;
			}
		}
		if (is_target) {
			target_jds[target_jds.length] = jds[i];
		}
	}
	
	// 写文件
	var out_file = "../peseus.github.io/post/recruitment_oss.json";
	var out_objs = {};
	out_objs.jobs = target_jds;
	fs.writeFileSync(out_file, JSON.stringify(out_objs));
	console.log('spider finished');
	process.emit('exit');
}

function get_jd_page(jd_page_index) {
	var jd_url = jd_urls[jd_page_index];
	console.log('start get page: ' + jd_url);
	
	var options = url.parse(jd_url);
	options.headers = { 'accept-encoding': 'gzip,deflate' };
	var request = http.get(options);
	
	request.on('response', function(response) {
		var save_file_path = jd_url.substring(jd_url.lastIndexOf('/') + 1);
		var output = fs.createWriteStream(save_file_path);
		
		switch (response.headers['content-encoding']) {
		case 'gzip':
			response.pipe(zlib.createGunzip()).pipe(output);
			break;
		case 'deflate':
			response.pipe(zlib.createInflate()).pipe(output);
			break;
		default:
			response.pipe(output);
		break;
		}
		
		output.on('finish', function () {
			console.log('finish get page: ' + jd_url);
			
			var data = fs.readFileSync(save_file_path, {'encoding':'utf-8'});
			var document = jsdom.jsdom(data);
			
			// 处理职位
			try {
				var name = document.querySelectorAll('div.main-view h1')[0].innerHTML;
				var sup_node = document.querySelectorAll('div.main-view h2 sup')[0];
				sup_node.parentNode.removeChild(sup_node);
				var company_desc = document.querySelectorAll('div.main-view h2')[0].innerHTML;
				var company_padding = "招聘企业：";
				var company = company_desc.substring(company_padding.length);
				var salary = document.querySelectorAll('.big_size')[0].innerHTML;
				var el_uls = document.querySelectorAll('.a-content ul');
				var el_lis = el_uls[1].querySelectorAll('li');
				var el_places = el_lis[4].querySelectorAll('a');
				var places = el_places[0].innerHTML;
				for (var p = 1; p < el_places.length; p++) {
					places = places + ',' + el_places[p].innerHTML;
				}
				var hash = crypto.createHash('md5');
				hash.update(jd_url, 'ascii');
				var uuid = hash.digest('hex');
				
				var jd = {
						'url' : jd_url,
						'place': places,
						'name': name,
						'salary': salary,
						'company': company,
						'uuid': uuid
				};
				jds[jds.length] = jd;
			} catch (e) {
				console.log(e.message);
				console.log(e.stack);
			}
			
			jd_page_index++;
			if (jd_page_index < jd_urls.length) {
				get_jd_page(jd_page_index);
			}
			else {
				createLocalJDFile();
			}
		});
	});

	request.on('error', function (e) {
		console.log('problem with request[' + jd_page_index + ' : '+ jd_url + ']: ' + e.message);
	});
}

function get_page(page_num) {
	console.log('process page ' + page_num);
	
	var host = 'a.liepin.com';
	var request = http.get({ host: host,
		path: '/jobpage/showrunhjobs/?pageSize=10&curPage=' + page_num + '&user_id=1075712',
		port: 80,
		headers: { 'accept-encoding': 'gzip,deflate' } });

	request.on('response', function(response) {
		var temp_file_path = host + '.' + page_num + '.html';
		var output = fs.createWriteStream(temp_file_path);
		
		switch (response.headers['content-encoding']) {
		case 'gzip':
			response.pipe(zlib.createGunzip()).pipe(output);
			break;
		case 'deflate':
			response.pipe(zlib.createInflate()).pipe(output);
			break;
		default:
			response.pipe(output);
		break;
		}
		
		output.on('finish', function () {
			var data = fs.readFileSync(temp_file_path, {'encoding':'utf-8'});
			var document = jsdom.jsdom('<html><body>' + data + '<body></html>');
			
			//找出总页数
			if (0 === total_page_num) {
				var total_page_selector = "div .addition";
				var page_num_desc = document.querySelectorAll(total_page_selector)[0].innerHTML;
				var page_num_desc_prefix = "共";
				var page_num_desc_posfix = "页";
				if (page_num_desc.length < 3) {
					throw "find total page number failed";
				}
				else if (page_num_desc_prefix !== page_num_desc.substring(0, 1)) {
					throw "find total page number failed. prefix invalid";
				}
				else if (page_num_desc_posfix !== page_num_desc.substring(page_num_desc.length - page_num_desc_posfix.length)) {
					throw "find total page number failed. posfix invalid";
				}
				var page_num_string = page_num_desc.substring(page_num_desc_prefix.length, page_num_desc.length - page_num_desc_posfix.length);
				total_page_num = parseInt(page_num_string, 10);
				if (0 === total_page_num) {
					throw 'no data? joking me';
				}
				else if (total_page_num < 0 || total_page_num > 50) {
					throw 'total page num exception: total_page_num = ' + total_page_num;
				}
			}
			
			//处理本页
			parseOnePage(document);
			page_num++;
			if (page_num >= total_page_num) {
				get_jd_page(0);
			}
			else {
				get_page(page_num);
			}
		});
	});
}

get_page(0);



