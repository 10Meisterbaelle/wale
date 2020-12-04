function receiveMessage(obj){
    if(obj.data.indexOf('Greenpeace-Webtool-resizePetitionFrame-') != -1) {
        var height = obj.data.substr(obj.data.indexOf('Greenpeace-Webtool-resizePetitionFrame-') + 39);
        document.getElementById('greenpeace-webtool-petition').style.height = height + 'px';
    }
}

if(window.addEventListener){
    window.addEventListener('message', receiveMessage, false);
} else {
    window.attachEvent('onmessage', receiveMessage);
}