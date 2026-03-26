import sys

sys.path.insert(0, r"E:\projects\lastmile-project\backend")

import app


if __name__ == "__main__":
    app.app.run(debug=False, use_reloader=False, host="0.0.0.0", port=5000)
