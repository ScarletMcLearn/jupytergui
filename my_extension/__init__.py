

def _jupyter_nbextension_paths():
    return [dict(
        section="notebook",
        # the path is relative to the `my_fancy_module` directory
        src="static",
        # directory in the `nbextension/` namespace
        dest="my_extension",
        # _also_ in the `nbextension/` namespace
        require="my_extension/main")]


def _jupyter_server_extension_paths():
    return [{
        "module": "my_extension"
    }]


def load_jupyter_server_extension(nbapp):
    nbapp.log.info("my_extension enabled!")
