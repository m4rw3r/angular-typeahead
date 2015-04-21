(function(angular) {
  "use strict";

  /** @const */
  var KEY_ARROW_DOWN = 40;
  /** @const */
  var KEY_ARROW_UP   = 38;
  /** @const */
  var KEY_ENTER      = 13;
  /** @const */
  var KEY_ESC        = 27;
  
  /** @const */
  var CONFIG_DEFAULTS = {
    activeClass:   "mw-typeahead__item--active",
    dropdownClass: "mw-typeahead__dropdown",
    elementClass:  "mw-typeahead",
    inputClass:    "mw-typeahead__input",
    caseSensitive: true,
    itemMax:       10,
    debounce:      100
  };

  function identity(a) {
    return a;
  }

  function contains(str) {
    return function(a) {
      return a.indexOf(str) === 0;
    };
  }

  /**
   * Function attempting to parse a boolean from a string.
   * 
   * @param  {*}
   * @param  {*=}
   * @return {boolean|*}  Boolean or the value set as defaultValue
   */
  function fromBool(maybeStr, defaultValue) {
    switch(typeof maybeStr === "string" ? maybeStr.toLowerCase().trim() : "") {
      case "true":
        return true;
      case "false":
        return false;
      default:
        return defaultValue;
    }
  }

  /**
   * Provider for global configuration of defaults.
   * 
   * @constructor
   */
  function MwTypeaheadConfigProvider() {
    this._config = angular.extend({}, CONFIG_DEFAULTS);
    this.$get    = function() {
      return this._config;
    };
    
    /**
     * Sets the default element class name for the surrounding div.
     * 
     * @param {string}
     */
    this.setElementClass = function(klass) {
      this._config.elementClass = klass;
    };
    /**
     * Sets the default input element class name.
     * 
     * @param {string}
     */
    this.setInputClass = function(klass) {
      this._config.inputClass = klass;
    };
    /**
     * Sets the default class-name which will be applied to highlighted
     * items in the suggestion-list.
     * 
     * @param {string}
     */
    this.setActiveClass = function(klass) {
      this._config.activeClass = klass;
    };
    /**
     * Sets the default class-name which will be applied to the dropdown
     * ul-element.
     * 
     * @param {string}
     */
    this.setDropdownClass = function(klass) {
      this._config.dropdownClass = klass;
    };
    /**
     * Sets the default case-sensitivity setting for local matching
     * of item texts and input value.
     * 
     * @param {boolean}
     */
    this.setCaseSensitive = function(value) {
      this._config.caseSensitive = value;
    };
    /**
     * Sets the default expected maximum number of items returned from
     * the item-query expression.
     * 
     * @param {number}
     */
    this.setItemMax = function(value) {
      this._config.maxItems = value;
    };
    /**
     * Sets the default debounce timeout.
     * 
     * @param {number}
     */
    this.setDebounceTimeout = function(value) {
      this._config.debounce = value;
    };
  }

  /**
   * Flexible typeahead directive.
   * 
   * Required attributes:
   *  * ng-model:
   *      The model instance to put the selected value in, standard
   *      angularjs directive.
   *  * item-query:
   *      The expression to evaluate to retrieve additional items,
   *      can return a populated array or a promise of one. In the expression
   *      the parameter ``prefix`` will be set to the user-typed string in the
   *      expression.
   *  * item-text:
   *      The expression evaluated for each item when performing offline
   *      filtering, matching against entered text and filling the input when
   *      the model is selected.
   * 
   * Optional attributes:
   *  * item-max:
   *      The expected maximum number of items in the response from the
   *      item-query expression. If the number of items returned is less than
   *      this the typeahead directive will exclusively use offline filtering
   *      against the evaluated item-text expressions.
   *      
   *      Default: 10
   *      
   *  * active-class:
   *      The class name applied to the highlighted item in the typeahead
   *      suggestion-list.
   *      
   *      Default: "mw-typeahead__item--active"
   *      
   *  * case-sensitive:
   *      If the matching on item-text should be case-sensitive or not.
   *      
   *      Default: true
   *      
   *  * debounce:
   *      The timeout in milliseconds before text-changes issues queries
   *      and updates the suggestion list. This timeout does not apply
   *      when the user enters the first character or empties the input,
   *      those events will fire the queries immediately.
   *      
   *      Default: 100
   *      
   *  * dropdown-class:
   *      The class(es) applied to the dropdown ul-element.
   *      
   *      Default: "mw-typeahead__dropdown"
   *      
   *  * element-class:
   *      The class added to the surrounding div.
   *      
   *      Default: "mw-typeahead"
   *      
   *  * input-class:
   *      The class added to the input element.
   *      
   *      Default: "mw-typeahead__input"
   *
   * All of the defaults of the optional attributes can be changed via the
   * mwTypeaheadConfig provider.
   * 
   * Example:
   * <code>
   *   <mw-typeahead item-query="listUsers(prefix)"
   *                 item-text="item.email"
   *                 ng-model="selectedUser"
   *                 ng-required="true">
   *      <li>{{::item.email}}</li>
   *   </mw-typeahead>
   * </code>
   */
  mwTypeahead.$inject = ["mwTypeaheadConfig", "$animate", "$timeout"];
  function mwTypeahead(config, $animate, $timeout) {
    return {
      restrict:   "E",
      replace:    true,
      require:    "^ngModel",
      transclude: true,
      scope:      {
        /* Expression to be evaluated with the parameter 'prefix'.
           Should return a list of items or a promise of a list of items for the given prefix. */
        itemQuery:   "&itemQuery",
        /* Expression to be evaluated with the parameter 'item'.
           Should return a string representation of the item suitable for the
           typeahead */
        itemText:    "&itemText",
      },
      template: "<div>" +
        "<input type=\"text\" ng-model=\"text\" />" +
        "<ul ng-show=\"showList\"></ul>" +
      "</div>",
      link: function($scope, elem, attrs, ngModel, $transclude) {
        var elItemList     = elem.find("ul");
        var elInput        = elem.find("input");
        /* The latest issued call to elem-query */
        var currentPromise = null;
        /* Promise for debounce of text-changes, used for debounce */
        var debounceText   = null;
        /* If the internal matching and filtering should be case-sensitive */
        var caseSensitive  = fromBool(attrs.caseSensitive, config.caseSensitive);
        /* Cut off for internal filtering */
        var itemMax        = attrs.hasOwnProperty("itemMax") ? parseInt(attrs.itemMax, 10) : config.itemMax;
        /* Class added to active item */
        var activeClass    = attrs.activeClass || config.activeClass;
        /* Debounce timeout for changes not going to/from empty string */
        var debounce       = attrs.hasOwnProperty("debouce") ? parseInt(attrs.debounce, 10) : config.debounce;
        /* By default just passthrough as we're case-sensitive by default */
        var normalize      = identity;
        /**
         * List of items in the suggestion-list.
         * 
         * @type {Array<{el: JQLite, data: *}>}
         */
        var itemNodes      = [];

        $scope.text        = null;
        $scope.active      = null;
        $scope.showList    = false;

        elInput.addClass(   attrs.hasOwnProperty("inputClass")    ? attrs.inputClass    : config.inputClass);
        elItemList.addClass(attrs.hasOwnProperty("dropdownClass") ? attrs.dropdownClass : config.dropdownClass);
        elem.addClass(      attrs.hasOwnProperty("elementClass")  ? attrs.elementClass  : config.elementClass);

        function toText(e) {
          return $scope.itemText({item: e});
        }

        if( ! caseSensitive) {
          normalize = function(str) {
            return str.toLowerCase();
          };
        }

        /**
         * Selects a given item.
         * 
         * @param item
         * @param cont  If to still show the list, default false
         */
        function select(item, showList) {
          $scope.active = item;

          if( ! item) {
            $scope.text = "";
            /* Stop receiving data from promises when the list has been reset */
            currentPromise = false;

            updateItemNodes([]);
          }
          else {
            $scope.text     = toText(item);
            $scope.showList = showList ? itemNodes.length > 0 : false;
          }

          ngModel.$setViewValue(item);
        }
        
        function itemNodeData(n) {
          return n.data;
        }

        function selectFromText(text) {
          if( ! text) {
            return select(null);
          }

          var itemTexts = itemNodes.map(itemNodeData).map(toText).map(normalize);
          var matches   = itemTexts.filter(contains(normalize(text)));

          if(matches.length === 1) {
            /* Only one potential match, select it */
            var idx = itemTexts.indexOf(text);

            if(idx !== -1) {
              /* Let the user continue to choose */
              select(itemNodes[idx].data, true);
            }
          }
        }

        /**
         * updateItemNodes() updates the itemNodes list to match the supplied newItems array.
         * 
         * It does an incremental update, only removing the nodes which are not
         * present in newItems and adding the ones which are lacking in
         * itemNodes.
         * 
         * It is assumed that the order is the same between the input
         * and the itemNodes array.
         * 
         * @param {Array<Object>}
         */
        function updateItemNodes(newItems) {
          function addItem(item, prev) {
            return $transclude(function(elItem, itemScope) {
              itemScope.item   = item;
              itemScope.select = select;

              mwTypeaheadElemLink(elItem, itemScope, $scope, activeClass);

              $animate.enter(elItem, elItemList, prev);
            });
          }
          
          var i    = 0;
          var j    = 0;
          var nLen = newItems.length;
          
          while(i < nLen || j < itemNodes.length) {
            if(itemNodes[j] && ! newItems[i]) {
              /* debug("Removing", JSON.stringify(itemNodes[j].data), "at", j); */
              $animate.leave(itemNodes[j].el);
              
              itemNodes.splice(j, 1);
              
              j--;
            }
            else if(newItems[i] && ! itemNodes[j]) {
              /* debug("Adding", JSON.stringify(newItems[i]), "at", j); */
              itemNodes.splice(j, 0, {
                data: newItems[i],
                el:   addItem(newItems[i], itemNodes[j - 1] ? itemNodes[j - 1].el : null)
              });
            }
            else if( ! angular.equals(newItems[i], itemNodes[j].data)) {
              /* debug("Adding", JSON.stringify(newItems[i]), "at", j, "before", JSON.stringify(itemNodes[j].data)); */
              itemNodes.splice(j, 0, {
                data: newItems[i],
                el:   addItem(newItems[i], itemNodes[j - 1] ? itemNodes[j - 1].el : null)
              });
            }
            /* else {
              debug("Keeping", JSON.stringify(newItems[i]));
            } */
            
            i++;
            j++;
          }
          
          $scope.active   = newItems[0] || null;
          $scope.showList = newItems.length > 0;
        }
        
        function setText(newValue, oldValue) {
          /* If the value hasn't changed, or if we already have
             it selected, then do not issue any queries */
          if(newValue === oldValue || newValue === toText(ngModel.$viewValue)) {
            return;
          }

          /* Local copy of the promise, to use inside promise
             resolution code to determine if the result is still
             applicable.  */
          var p      = null;
          var update = function(items) {
            /* Only populate items if it was the most current issued promise. */
            if(currentPromise === p) {
              updateItemNodes(items);

              selectFromText($scope.text);
            }
          };

          if(newValue && oldValue &&
             itemNodes.length < itemMax && currentPromise &&
             newValue.indexOf(oldValue) === 0) {
            /* Skip query as we can filter locally */
            var needle = normalize(newValue);

            p = (currentPromise = itemNodes.filter(function(i) {
              return normalize(toText(i.data)).indexOf(needle) === 0;
            }).map(itemNodeData));
          }
          else {
            p = (currentPromise = $scope.itemQuery({prefix: newValue}));
          }

          if(typeof p.then === "function") {
            p.then(update);
          }
          else {
            update(p);
          }
        }

        $scope.$watch("text", function(newValue, oldValue) {
          $timeout.cancel(debounceText);

          /* Only apply debounce if both values are non-empty,
             we do not want to delay the immediate population
             of the suggestion-list */
          debounceText = $timeout(function() {
            setText(newValue, oldValue);
          }, newValue && oldValue ? debounce : 0);
        });

        ngModel.$render = function() {
          select(ngModel.$viewValue);
        };

        elem.on("keydown", function(e) {
          if(e.keyCode === KEY_ENTER && $scope.active !== ngModel.$viewValue) {
            /* Only handle enter click if the user has not already selected something */
            e.preventDefault();

            $scope.$apply(function() {
              select($scope.active);
            });
          }
          else if(e.keyCode === KEY_ARROW_DOWN) {
            e.preventDefault();

            $scope.$apply(function() {
              $scope.active = itemNodes[(itemNodes.map(itemNodeData).indexOf($scope.active) + 1) % itemNodes.length].data;
            });
          }
          else if(e.keyCode === KEY_ARROW_UP) {
            e.preventDefault();

            $scope.$apply(function(){
              var idx = itemNodes.map(itemNodeData).indexOf($scope.active) - 1;

              $scope.active = itemNodes[idx < 0 ? itemNodes.length - 1 : idx].data;
            });
          }
          else if(e.keyCode === KEY_ESC) {
            $scope.$apply(function() {
              $scope.showList = false;
            });
          }
        });

        elInput.on("focus", function() {
          $scope.$apply(function() {
            $scope.showList = itemNodes.length > 0;
          });
        });

        elInput.on("blur", function() {
          /* Timeout required to avoid hiding the list before clicks can be
             registered. */
          $timeout(function() {
            $scope.$apply(function() {
              $scope.showList = false;
            });
          }, 50);
        });
      }
    };
  }

  function mwTypeaheadElemLink(elem, $scope, $parent, activeClass) {
    elem.on("click", function() {
      $scope.$apply(function() {
        $scope.select($scope.item);
      });
    });

    var destroy = $parent.$watch("active", function() {
      if($parent.active === $scope.item) {
        elem.addClass(activeClass);
      }
      else {
        elem.removeClass(activeClass);
      }
    });
    
    elem.on("$destroy", function() {
      destroy();
    });
  }

  angular.module("mw-typeahead", [])
    .provider("mwTypeaheadConfig", MwTypeaheadConfigProvider)
    .directive("mwTypeahead", mwTypeahead);
})(angular);
