import sys
from json import dump, dumps, loads
from os import listdir
from os.path import isdir, isfile, join

from IPython.display import clear_output

from . import HOME_DIR, SIMPLEX_JSON_DIR, SIMPLEX_TASK_RECORD_FILEPATH
from .support import get_name, merge_dicts, title_str, cast_str_to_int_float_bool_or_str, reset_encoding
from .task import Task
from .taskview import TaskView


# TODO: use '_' prefix for local variables
class TaskManager:
    """
    Controller class that manages tasks and their views.
    """

    def __init__(self):
        """
        Constructor.
        """

        # List of tasks
        self.tasks = []

        # Most recent Jupyter Notebook namespace
        self.simplex_namespace = {}

    def update_simplex_namespace(self, namespace):
        """
        Update with the notebook_namespace.
        :param namespace: dict;
        :return: None
        """

        self.simplex_namespace = merge_dicts(self.simplex_namespace, namespace)

    def create_task_view(self, task_dict):
        """
        Make a Task and display it as a TaskView.
        :param task_dict: dict;
        :return: TaskView;
        """

        # Make a new Task
        task = Task(task_dict)
        self.tasks.append(task)

        # Return its TaskView
        return TaskView(self, task)

    def submit(self, taskJSON):
        """
        Execute function for when the cell runs.
        """
        # Retrieve all arguments
        default_args = {arg['arg_name']: arg['value'] for arg in taskJSON['default_args']}
        required_args = {arg['arg_name']: arg['value'] for arg in taskJSON['required_args']}
        optional_args = {arg['arg_name']: arg['value'] for arg in taskJSON['optional_args']}
        returns = [arg['value'] for arg in taskJSON['returns']]

        # Retrieve required and/or optional arguments
        # required_args = {input_name: field.value for input_name, field in fields['required_args'].items()}
        # optional_args = {input_name: field.value for input_name, field in fields['optional_args'].items()}
        # returns = [field.value for field in fields['returns']]

        # Verify all input parameters are present
        if None in required_args or '' in required_args:
            print('Please provide all required arguments.')
            return

        # Verify all output parameters are present
        if None in returns or '' in returns:
            print('Please provide all return names.')
            return

        # Clear any existing output
        clear_output()

        # Call function
        returned = self.execute_task(taskJSON['library_path'], taskJSON['library_name'], taskJSON['function_name'],
                                     required_args, default_args, optional_args, returns)

        if len(returns) == 1:
            self.simplex_namespace[returns[0]] = returned
        elif len(returns) > 1:
            for name, value in zip(returns, returned):
                self.simplex_namespace[name] = value
        else:
            # TODO: think about how to handle no-returns
            pass

    def execute_task(self, library_path, library_name, function_name, required_args, default_args, optional_args,
                     returns):
        """
        Execute a task.
        :param library_path: str;
        :param library_name: str;
        :param function_name: str;
        :param required_args: dict;
        :param default_args: dict;
        :param optional_args: dict;
        :param returns: list;
        :return: list; raw output of the function
        """

        print('Executing ...')

        # Append a library path
        # TODO: what's the effect of the last '/' in the path?
        print('\tsys.path.insert(0, \'{}\')'.format(library_path))
        sys.path.insert(0, library_path)

        # Import function
        code = 'from {} import {} as function'.format(library_name, function_name)
        print('\t{}'.format(code))
        exec(code)

        # Process args
        args = self.process_args(required_args, default_args, optional_args)

        # Execute
        print('\n\tExecuting {}:'.format(locals()['function']))
        for a, v in sorted(args.items()):
            print('\t\t{} = {} ({})'.format(a, get_name(v, self.simplex_namespace), type(v)))

        return locals()['function'](**args)

    def process_args(self, required_args, default_args, optional_args):
        """
        Convert input str arguments to corresponding values:
            If the str is the name of a existing variable in the Notebook namespace, use its corresponding value;
            If the str contains ',', convert it into a list of str
            Try to cast str in the following order and use the 1st match: int, float, bool, and str;
        :param required_args: dict;
        :param default_args: dict;
        :param optional_args: dict;
        :return: dict; merged dict
        """

        print('Processing arguments ...')

        if any(set(required_args.keys() & default_args.keys() & optional_args.keys())):
            raise ValueError('Argument {} is duplicated.')

        args = merge_dicts(required_args, default_args, optional_args)
        processed_args = {}

        for n, v in args.items():

            if v in self.simplex_namespace:  # Process as already defined variable from the Notebook environment
                processed_v = self.simplex_namespace[v]

            else:  # Process as float, int, bool, or string
                # First assume a list of strings to be passed
                processed_v = [cast_str_to_int_float_bool_or_str(s) for s in v.split(',') if s]

                # If there is only 1 item in the assumed list, use it directly
                if len(processed_v) == 1:
                    processed_v = processed_v[0]

            processed_args[n] = processed_v
            # print('\t{}: {} > {} ({})'.format(n, v, get_name(processed_v, self.simplex_namespace), type(processed_v)))

        return processed_args


# ======================================================================================================================
# SimpleX support functions
# ======================================================================================================================
# TODO: return as only dictionary
def compile_tasks(json_directory_path=SIMPLEX_JSON_DIR, record_filepath=SIMPLEX_TASK_RECORD_FILEPATH,
                  return_type=str):
    """

    :param json_directory_path: str; the main directory that contains all library directories
    :param record_filepath: str; .json containing all available tasks' specifications
    :param return_type: type; dict or str
    :return: dict; all tasks' specifications
    """

    tasks_by_libraries = dict()
    for f in listdir(json_directory_path):
        if f.startswith('COMPILED'):
            continue

        fp_json = join(json_directory_path, f)
        try:
            tasks = load_task(fp_json)
            tasks_by_libraries.update(tasks)
        except:
            pass

    if record_filepath:
        if not record_filepath.endswith('.json'):
            record_filepath += '.json'
        with open(record_filepath, 'w') as f:
            dump(tasks_by_libraries, f, sort_keys=True, indent=2)

    if return_type == str:
        return dumps(tasks_by_libraries)

    elif return_type == dict:
        return tasks_by_libraries


def load_task(json_filepath):
    """

    :param json_filepath: str; absolute filepath to library.json
    :return: None
    """

    # print('Loading {} ...'.format(filepath))

    if not isfile(json_filepath):
        raise FileNotFoundError('The file {} isn\'t found or isn\'t an absolute path.')

    # Open .json
    with open(json_filepath) as f:
        read = f.read()
        library = loads(reset_encoding(read))

    processed_tasks = dict()

    # Load library path
    if 'library_path' in library:  # Use specified library path
        library_path = library['library_path']

        # TODO: remove old code

        # Make sure the library path does not end with '/'
        # if library_path.endswith('/'):
        #     library_path = library_path[:-1]
        #     # print('\tRemoved the last \'/\' from library_path, which is now: {}.'.format(library_path))

        # Make sure the library path ends with '/'
        if not library_path.endswith('/'):
            library_path += '/'
            # print('\tAppended \'/\' to library_path, which is now: {}.'.format(library_path))

        if not isdir(library_path):  # Use absolute path
            library_path = join(HOME_DIR, library_path)
            # print('\tConverted the library path to the absolute path relative to the $HOME directory: {}.'.format(
            #     library_path))

    else:  # Guess library path to be found in the same directory as this .json
        raise ValueError('\'library_path\' is not specified in {}.'.format(json_filepath))

    # Load library tasks
    for t in library['tasks']:

        function_path = t['function_path']
        if '.' in function_path:
            split = function_path.split('.')
            library_name = '.'.join(split[:-1])
            function_name = split[-1]
        else:
            raise ValueError('Function path must be like: \'path.to.file_containing_the_function.function_name\'.')

        # Task label is this task's UID; so no duplicates are allowed
        if 'label' in t:
            label = t['label']
        else:
            label = '{} (no label)'.format(function_name)

        if label in processed_tasks:  # Label is duplicated
            print('\'{}\' task label is duplicated.; automatically making a new label ...'.format(label))

            i = 2
            new_label = '{} (v{})'.format(label, i)
            while new_label in processed_tasks:
                i += 1
                new_label = '{} (v{})'.format(label, i)
            label = new_label

        processed_tasks[label] = dict()
        processed_tasks[label]['library_path'] = library_path
        # Load task library name
        processed_tasks[label]['library_name'] = library_name
        # Load task function name
        processed_tasks[label]['function_name'] = function_name
        if 'description' in t:  # Load task description
            processed_tasks[label]['description'] = t['description']
        else:
            processed_tasks[label]['description'] = 'No info.'
        # Load task required, optional, and/or default arguments
        for arg_type in ['required_args', 'optional_args', 'default_args']:
            if arg_type in t:
                processed_tasks[label][arg_type] = process_args(t[arg_type])
            else:
                processed_tasks[label][arg_type] = []
        # Load task returns
        if 'returns' in t:
            processed_tasks[label]['returns'] = process_returns(t['returns'])
        else:
            processed_tasks[label]['returns'] = []

    return processed_tasks


def process_args(dicts):
    """

    :param dicts: list; list of dict
    :return: dict;
    """

    processed_dicts = []

    for d in dicts:
        processed_d = dict()

        # Load arg_name
        processed_d['arg_name'] = d['arg_name']

        if 'value' in d:  # Load default value
            processed_d['value'] = d['value']
        else:
            processed_d['value'] = ''

        if 'label' in d:  # Load label
            processed_d['label'] = d['label']
        else:  # Set label as the arg_name
            processed_d['label'] = title_str(d['arg_name'])

        if 'description' in d:  # Load description
            processed_d['description'] = d['description']
        else:
            processed_d['description'] = 'No info.'

        processed_dicts.append(processed_d)

    return processed_dicts


def process_returns(dicts):
    """

    :param dicts: list; list of dict
    :return: dict;
    """

    processed_dicts = []

    for d in dicts:
        processed_d = dict()

        # Load label
        processed_d['label'] = d['label']

        if 'description' in d:  # Load description
            processed_d['description'] = d['description']
        else:
            processed_d['description'] = 'No info.'

        processed_dicts.append(processed_d)

    return processed_dicts
