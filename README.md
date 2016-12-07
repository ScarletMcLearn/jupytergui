SimpleX
=
SimpleX: simple execution interface for Jupyter Notebook.

Sample .json file:
{
  "library_name": "sample_library",
  "tasks": [
    {
      "label": "Task 1 (UID)",
      "function_name": "function",
      "description": "Description (optional)",
      "required_args": [
        {
          "arg_name": "arg1",
          "label": "Argument 1 (optional)",
          "description": "Description for this required argument. (optional)"
        }
      ],
      "optional_args": [
        {
          "arg_name": "arg2",
          "label": "Optional Argument 2 (optional)",
          "description": "Description for this optional argument. (optional)"
        }
      ],
      "default_args": [
        {
          "arg_name": "arg3",
          "arg_value": "default_value"
        }
      ],
      "returns": [
        {
          "label": "Return 1",
          "description": "Description for this returned value. (optional)"
        }
      ]
    }
  ]
}