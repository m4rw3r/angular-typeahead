====================
Angular-mw-typeahead
====================

Flexible AngularJS Typeahead directive without external dependencies.

Examples
========

Simple list:

```javascript
var User = $resource("/api/users");

$scope.users = [];

$scope.queryUsers = function(prefix) {
  return User.query({prefix: prefix, limit: 5}).$promise;
};
```

```html
<mw-typeahead ng-model="selectedItem"
              ng-change="users.push(selectedItem); selectedItem = null"
              item-query="queryUsers(prefix)"
              item-text="item.email">
  <li>{{::item.email}}</li>
</mw-typeahead>

<ul>
  <li ng-repeat="u in users">{{::u.email}}</li>
</ul>
```

This is a very simple example, and probably the more typical use of a
typeahead: adding items to a list once selected and prompting the user
to add additional ones.

As a part of a form:

```html
<form name="messageForm"
      ng-submit="messageForm.$valid && submitForm()">
  <div class="form--row">
      <label>User:</label>

      <mw-typeahead ng-model="user"
                    ng-required="true"
                    item-query="queryUsers(prefix)"
                    item-text="item.email"
                    item-max="5">
        <li>
          <img src="{{::item.userAvatarUrl}}" />
          <span>{{::item.email}}</span>
        </li>
      </mw-typeahead>
  </div>
  
  <div class="form--row">
    <label>Message:</label>
    
    <textarea ng-model="message"
              ng-required="true"></textarea>
  </div>
  
  <div class="form--row">
    <input type="submit" value="Send message" />
</form>
```

The above code enables the user to select the recipent by having the typeahead
autocomplete the user for him/her. The ``ng-model`` integration allows for
form-validation to take place, making it simple to integrate into any
AngularJS-managed form. Note that you can define any HTML you like inside the
``mw-typeahead`` tag, this HTML will be rendered for each suggested item in the
list.
