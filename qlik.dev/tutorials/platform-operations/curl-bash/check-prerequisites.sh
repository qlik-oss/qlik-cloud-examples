#!/bin/bash

if ! curl --version > /dev/null 2>&1 ;
then
  echo "ERROR: curl is not installed and is required."
  exit 1
fi

if ! curl https://www.google.com -s --fail-with-body > /dev/null 2>&1 ;
then
  echo "ERROR: curl version 7.76.0 or higher is required."
  exit 1
fi

if ! jq --version > /dev/null 2>&1 ;
then
  echo "ERROR: jq is not installed."
  exit 1
fi

if ! python --version > /dev/null 2>&1 ;
then
  echo "ERROR: Python is not installed (version 3.8 or higher is required)."
  exit 1
fi

if ! python -c 'import sys; exit(0) if sys.version_info.major == 3 and sys.version_info.minor >= 8 else exit(1)' > /dev/null 2>&1 ;
then
  echo "ERROR: Python 3.8 or higher is required."
  exit 1
fi

if ! python -c 'import jwt' > /dev/null 2>&1 ;
then
  echo "ERROR: Python requirements are not installed. Please run: "
  echo ""
  echo "   pip install -r ../sdk-python/requirements.txt"
  echo ""
  exit 1
fi
