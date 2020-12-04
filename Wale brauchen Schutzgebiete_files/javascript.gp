function geoplugin_request() { return '217.149.173.122';} 
function geoplugin_status() { return '200';} 
function geoplugin_credit() { return 'Some of the returned data includes GeoLite data created by MaxMind, available from <a href=\'http://www.maxmind.com\'>http://www.maxmind.com</a>.';} 
function geoplugin_delay() { return '2ms';} 
function geoplugin_city() { return 'Vienna';} 
function geoplugin_region() { return 'Vienna';} 
function geoplugin_regionCode() { return '9';} 
function geoplugin_regionName() { return 'Vienna';} 
function geoplugin_areaCode() { return '';} 
function geoplugin_dmaCode() { return '';} 
function geoplugin_countryCode() { return 'AT';} 
function geoplugin_countryName() { return 'Austria';} 
function geoplugin_inEU() { return 1;} 
function geoplugin_euVATrate() { return 20;} 
function geoplugin_continentCode() { return 'EU';} 
function geoplugin_latitude() { return '48.2167';} 
function geoplugin_longitude() { return '16.4';} 
function geoplugin_locationAccuracyRadius() { return '20';} 
function geoplugin_timezone() { return 'Europe/Vienna';} 
function geoplugin_currencyCode() { return 'EUR';} 
function geoplugin_currencySymbol() { return '&#8364;';} 
function geoplugin_currencySymbol_UTF8() { return '€';} 
function geoplugin_currencyConverter(amt, symbol) { 
	if (!amt) { return false; } 
	var converted = amt * 0.8228; 
	if (converted <0) { return false; } 
	if (symbol === false) { return Math.round(converted * 100)/100; } 
	else { return '&#8364;'+(Math.round(converted * 100)/100);} 
	return false; 
} 
