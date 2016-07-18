#!/bin/bash
git stash
git checkout staging
git stash apply
echo -e "Enter commit message: "
read
git commit -a -m "$REPLY"
git push origin staging
git checkout master
git merge staging
git push origin master
git checkout staging