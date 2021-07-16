package_name="janpieterbaert/mu-cache-clear"
version=$(shell npm -s run env echo '$$npm_package_version')

containers:
	docker build -t ${package_name} . && docker tag ${package_name} ${package_name}:${version}

push: containers
	docker push ${package_name} && docker push ${package_name}:${version}
