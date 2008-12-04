#!/bin/bash
#
# This tool unpacks a full update package generated by make_full_update.sh
# Author: Darin Fisher
#

# -----------------------------------------------------------------------------
# By default just assume that these tools exist on our path
MAR=${MAR:-mar}
BZIP2=${BZIP2:-bzip2}

# -----------------------------------------------------------------------------
#
print_usage() {
  echo "Usage: $(basename $0) [OPTIONS] ARCHIVE"
}

if [ $# = 0 ]; then
  print_usage
  exit 1
fi

if [ $1 = -h ]; then
  print_usage
  echo ""
  echo "The contents of ARCHIVE will be unpacked into the current directory."
  echo ""
  echo "Options:"
  echo "  -h  show this help text"
  echo ""
  exit 1
fi

# -----------------------------------------------------------------------------

archive="$1"

# Generate a list of all files in the archive.
files=($($MAR -t "$archive" | cut -d'	' -f3))

# Extract the files, creating subdirectories.  The resulting files are bzip2
# compressed, so we need to walk the list of files, and decompress them.
$MAR -x "$archive"

num_files=${#files[*]}

# Skip first "file" since it is actually the column header string "NAME" that
# does not correspond to an actual file in the archive.
for ((i=1; $i<$num_files; i=$i+1)); do
  eval "f=${files[$i]}"

  echo "  decompressing $f"

  mv -f "$f" "$f.bz2"
  $BZIP2 -d "$f.bz2"
done
