# ghettoQuery

A light weight solution mimicking jQuery selectors and a few methods.

## Usage

#### $(selectors):
```js
$('.class').selector or $('#id').selector
```

#### $.each(selector, callback):
```js
$.each($('.class'), function(index, selector) {
    //your code here
});
```

#### $.ajax({options}):
```js
$.ajax({
    url: 'http://some-url.com/api/v1/feed',
    method: 'get',
    dataType: 'jsonp',
    success: function(data) {
        console.log(data);

        //returns json data
    }
});
```

#### $.css(property, style):

Single Property:
```js
$(selector).css('background-color', 'red');
```

Multiple Properties:
```js
$(selector).css({
    'background-color': 'red',
    'margin-left': '100px'
});
```

Get CSS Property:
```js
$(selector).css('background-color');

// returns 'red'
```

#### $.on(eventType, callback):
```js
$(selector).on('click', function() {
   //your code here
});
```

#### $.html(html):
```js
$(selector).html('<h1>Yo Dawg this is ghetto</h1>');
```

#### $.addClass(classes):
```js
$(selector).addClass('ghetto');
```

#### $.removeClass(classes):
```js
$(selector).removeClass('ghetto');
```

#### $.attr(attr, val):

Add Attribute and Value
```js
$(selector).attr('data-url', 'www.bomb.com');
```

Get Attribute's Value
```js
$(selector).attr('data-url');

// returns 'www.bomb.com'
```

#### $.hide():
```js
$(selector).hide();
```

#### $.show():
```js
$(selector).show();
```


## Examples
```js
var array = ['a', 'b', 'c', 'd'];

$.each(array, function() {
    //attach a click event to each element!
    $('#id-'+i).on('click', someMethod());

    //add a 1px black border to each element!
    $('#id-'+i).css({'border': '1px solid #000'});

    //chaining is not supported yet!
});

function someMethod () {
    console.log('whoa look!');
}
```
