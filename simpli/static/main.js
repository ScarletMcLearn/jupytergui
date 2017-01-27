// Add shim to support Jupyter 3.x and 4.x
var Jupyter = Jupyter || IPython || {};
Jupyter.notebook = Jupyter.notebook || {};
var isInitDone = false;
const AUTO_EXEC_FLAG = "!AUTO_EXEC";
var groups = ['required_args', 'optional_args', 'returns'];
var groupLabels = ['Input', 'Optional Input', 'Output'];

/**
 * Wait for kernel before initializing extension.
 */
const initWrapper = function() {
  var interval = setInterval(function() {
    if (Jupyter.notebook.kernel && Jupyter.notebook.kernel.is_connected() && !Jupyter.notebook.kernel_busy) {
      init();
      clearInterval(interval);
    }
  }, 50);
};

/**
 * Initializes the extension.
 */
const init = function() {
  setupCallbacks();
  autoRunWidgets();
  addMenuOptions();
  mapKeyboardShortcuts();

  console.log('Simpli nbextension initialized.');
};

/**
 * Setup cell execution callbacks to the notebook kernel.
 */
const setupCallbacks = function() {
  var initCode =
    `
global task_manager

def init_libs():
    global os
    import os

    global json
    import json

    global matplotlib
    import matplotlib

    global TaskManager
    from simpli import TaskManager

    %matplotlib inline

    # Initialize a TaskManager
    global task_manager
    task_manager = TaskManager()

    global dwidgets
    import declarativewidgets as dwidgets

    # Initialize declarative widgets
    dwidgets.init()

def sync_namespaces():
    '''
    Sync namespaces of this Notebook and Simpli TaskManager.
    '''

    # TaskManager namespace ==> Notebook namespace
    for name, value in task_manager.simpli_namespace.items():
        globals()[name] = value

    # Notebook namespace ==> TaskManager namespace
    global task_manager
    task_manager.update_simpli_namespace(globals())

def load_web_components():
    imports = '''
    <link rel='import' href='urth_components/iron-form/iron-form.html'
          is='urth-core-import' package='PolymerElements/iron-form'>
    <link rel='import' href='urth_components/paper-input/paper-input.html'
          is='urth-core-import' package='PolymerElements/paper-input'>
    <link rel='import' href='urth_components/iron-label/iron-label.html'
          is='urth-core-import' package='PolymerElements/iron-label'>
    <link rel='import' href='urth_components/paper-button/paper-button.html'
          is='urth-core-import' package='PolymerElements/paper-button'>
    <link rel='import' href='urth_components/iron-icon/iron-icon.html'
          is='urth-core-import' package='PolymerElements/iron-icon'>
    <link rel='import' href='urth_components/paper-material/paper-material.html'
          is='urth-core-import' package='PolymerElements/paper-material'>
    <link rel='import' href='urth_components/paper-header-panel/paper-header-panel.html'
          is='urth-core-import' package='PolymerElements/paper-header-panel'>
    <link rel='import' href='urth_components/iron-collapse/iron-collapse.html'
          is='urth-core-import' package='PolymerElements/iron-collapse'>
    <link rel='import' href='urth_components/paper-collapse-item/paper-collapse-item.html'
          is='urth-core-import' package='Collaborne/paper-collapse-item'>

    '''
    get_ipython().run_cell_magic('HTML', '', imports)

# Register post execute cell callback
if sync_namespaces not in get_ipython().events.callbacks['post_execute']:
    get_ipython().events.register('post_execute', sync_namespaces)

# Register kernel initialization callback
if (init_libs not in get_ipython().events.callbacks['shell_initialized']):
    get_ipython().events.register('shell_initialized', init_libs)

if (load_web_components not in get_ipython().events.callbacks['shell_initialized']):
   get_ipython().events.register('shell_initialized', load_web_components)

# Initial namespace sync
init_libs()
load_web_components()
sync_namespaces()
`;

  // Kernel executes python code in background
  Jupyter.notebook.kernel.execute(initCode);

  // TODO: Initialize extension on kernel restart
  // Jupyter.notebook.kernel.restart(function() {
  //   waitForKernel();
  // });

  console.log('Called setupCallbacks()');
}


/**
 * Automatically run all Simpli widgets on initialization.
 * TODO: Forms should 'remember' their input
 */
const autoRunWidgets = function() {
  console.log('Called autoRunWidgets()');
  $.each($(".cell"), function(index, value) {
    var cellCode = $(value).html();
    if (cellCode.indexOf(AUTO_EXEC_FLAG) > -1) {
      toSimpliCell(index);
    } else if (cellCode.indexOf(AUTO_OUT_FLAG) > -1) {
      hideSimpliCell(index);
    }
  });
};

/**
 * Add menu options to notebook navbar and toolbar.
 */
const addMenuOptions = function() {
  const dropdown = $("#cell_type");
  const gpInDropdown = dropdown.find("option:contains('Simpli')").length > 0;

  if (!gpInDropdown) {
    // Add Simpli "cell type" to toolbar cell type dropdown menu
    dropdown.append($("<option value='code'>Simpli</option>"));

    // Change cell to Simpli cell type
    dropdown.change(function(event) {
      var type = $(event.target).find(":selected").text();
      if (type === "Simpli") {
        var former_type = Jupyter.notebook.get_selected_cell().cell_type;
        showTaskList();
      }
    });

    // Reverse the ordering of events so we check for ours first
    $._data($("#cell_type")[0], "events").change.reverse();
  }

  // Add to notebook navbar dropdown menu.
  // Menu path: Cell -> Cell Type -> Simpli
  const cellMenu = $("#change_cell_type");
  const gpInMenu = cellMenu.find("#to_simpli").length > 0;
  if (!gpInMenu) {
    cellMenu.find("ul.dropdown-menu").append(
      $("<li id='to_simpli' title='Insert a Simpli widget cell'><a href='#'>Simpli</a></option>")
      .click(function() {
        showTaskList();
      })
    );
  }

  // Add button for creating Simpli cell to toolbar
  Jupyter.toolbar.add_buttons_group([
    {
      'label': 'Insert Simpli Cell',
      'icon': 'fa-bolt', // select from http://fortawesome.github.io/Font-Awesome/icons/
      'callback': function() {
        Jupyter.notebook.insert_cell_below();
        Jupyter.notebook.select_next();
        showTaskList();
      }
    }
  ]);

  // Initialize the undo delete menu entry click function
  var undeleteCell = $('#undelete_cell a');
  undeleteCell.on("click", function(event) {
    undoDeleteCell();
  });
};

/**
 * Initialize custom keyboard shortcuts for Simpli.
 */
const mapKeyboardShortcuts = function() {
  // Initialize the Simpli cell type keyboard shortcut
  Jupyter.keyboard_manager.command_shortcuts.add_shortcut('shift-x', {
    help: 'to Simpli',
    handler: function() {
      showTaskList();
      return false;
    }
  });

  // Initialize the undo delete keyboard shortcut
  Jupyter.keyboard_manager.command_shortcuts.add_shortcut('z', {
    help: 'undo cell/widget deletion',
    handler: function() {
      undoDeleteCell();
      return false;
    }
  });

  // Handle esc key
  $('body').keydown(function(event) {

    // Remove focus from active element
    if (event.keyCode == 27 && event.shiftKey) {
      document.activeElement.blur();
    }

    // Close the library
    if (event.keyCode == 27 && $('#library-cancel-btn').length) {
      $('#library-cancel-btn').click();
      return;
    }

    // Select current task
    if (event.keyCode == 13 && $('#library-select-btn').length) {
      $('#library-select-btn').click();
    }
  });
}

/**
 * Undo deleting last set of cells/widgets.
 * FIXME: test if it actually works
 */
const undoDeleteCell = function() {
  // Make sure there are deleted cells to restore
  if (Jupyter.notebook.undelete_backup == null)
    return;

  var backup = Jupyter.notebook.undelete_backup;
  var startIndex = Jupyter.notebook.undelete_index;
  var endIndex = startIndex + backup.length;
  var indices = _.range(startIndex, endIndex);

  // Reinsert deleted cells appropriately
  Jupyter.notebook.undelete_cell();
  for (var i in indices) {
    var cell = $(".cell")[i];
    if ($(cell).html().indexOf(AUTO_EXEC_FLAG) >= 0) {
      toSimpliCell(i);
    }
  }
};

/**
 * Given group header, toggle adjacent iron-collapse element.
 * @param  {object} header corresponding header element for iron-collapse
 */
var formGroupToggle = function(header) {
  $(header).next().toggle();
}

const hideSimpliCell = function(index) {
  var cell = Jupyter.notebook.get_cell(index);
  cell.input.addClass("simpli-hidden");
  cell.element.find(".widget-area .prompt").addClass("simpli-hidden");
}

/**
 * Converts indicated cell to Simpli widget and hiding code input.
 * @param  {number} index    index of cell to convert
 * @param  {Object} taskJSON task JSON object
 */
const toSimpliCell = function(index, taskJSON) {
  // Use index if provided. Otherwise use index of currently selected cell.
  if (index === undefined) {
    index = Jupyter.notebook.get_selected_index();
  }

  cell = Jupyter.notebook.get_cell(index);

  /**
   * [cellChange description]
   */
  var cellChange = function() {
    if (taskJSON == undefined) {
      cell.execute();
    } else {
      renderTaskWidget(index, taskJSON);
    }
    // Setup cell after it renders
    var wait = setInterval(function() {
        if (!Jupyter.notebook.kernel_busy) {
          clearInterval(wait);

          // Hide code input
          hideSimpliCell(index);
        }
      },
      50);
  };

  /**
   * [cellChangeWrapper description]
   * @return {[type]}      [description]
   */
  var cellChangeWrapper = function() {
    // Wait for kernel to not be busy
    var interval = setInterval(function() {
      if (!Jupyter.notebook.kernel_busy) {
        clearInterval(interval);

        // Force cell type to code
        var cell_type = cell.cell_type;
        if (cell_type !== "code") {
          Jupyter.notebook.to_code(index);
        }

        cellChange();
      }
    }, 10);
  };

  // Display a dialog if rendering the cell will override user generated content.
  var cellContent = cell.get_text().trim();
  if (cellContent === "" || cellContent.indexOf(AUTO_EXEC_FLAG) >= 0) {
    cellChangeWrapper();
  } else {
    // Use dialog modal Boostrap plugin
    var dialog = require('base/js/dialog');
    dialog.modal({
      notebook: Jupyter.notebook,
      keyboard_manager: Jupyter.notebook.keyboard_manager,
      title: "Change to Simpli Cell?",
      body: "Are you sure you want to change this to a Simpli cell? This will cause " +
        "you to lose any code or other information already entered into the cell.",
      buttons: {
        "Cancel": {},
        "Change Cell Type": {
          "class": "btn-warning",
          "click": function() {
            cellChangeWrapper();
          }
        }
      }
    });
  }
};

var STATIC_PATH = location.origin + Jupyter.contents.base_url + "nbextensions/simpli/resources/";

define([
    'base/js/namespace',
    'base/js/events',
    'jquery',
    STATIC_PATH + 'taskList.js',
    STATIC_PATH + 'taskWidget.js'
], function(Jupyter, events) {
  function load_ipython_extension() {
    // Inject custom CSS
    $('head')
      .append(
        $('<link />')
        .attr('rel', 'stylesheet')
        .attr('type', 'text/css')
        .attr('href', STATIC_PATH + 'theme.css')
      );

    // Wait for the kernel to be ready and then initialize the widgets
    initWrapper();
  }

  return {
    load_ipython_extension: load_ipython_extension
  };
});