const path = require('path')
const fs = require('fs')
const exec = require('child_process').exec

const getThis = (el, path, emptyVal) => {
    if (path && path.toString().split) {
        path = [el].concat(path.toString().split(`.`))
    } else {
        path = [el]
    }

    let result = path.reduce(function (accumulator, currentValue) {
        if (accumulator === undefined) {
            return emptyVal
        }

        if (currentValue.indexOf(`.`) === -1 && currentValue.indexOf(`(`) > -1) {
            let argsString = ''

            let argsObj = /\((.*?)\)/g.exec(currentValue)

            if (argsObj) {
                argsString = argsObj[1] || ``
            }

            let args = argsString.split(`,`).map((arg) => { return arg.trim() })
            let functionName = currentValue.split(`(`)[0]

            if (typeof accumulator[functionName] === `function`) {
                let result = accumulator[functionName].apply(accumulator, args)
                return result
            }
        }

        if (currentValue) {
            return accumulator[currentValue]
        } else {
            return accumulator
        }

    })

    if (result === undefined) {
        return emptyVal
    }

    return result
}

const getComponentName = (obj) => {
    let name

    if (obj.children) {
        let length = obj.children.length
        while (!name && length--) {
            if (obj.children[length] && obj.children[length].name === `name` && obj.children[length].defaultValue) {
                name = obj.children[length].defaultValue
            }
        }
    }

    if (!name) {
        name = obj.name
    }

    return name.replace(/'|"|`/g, '').trim()
}

const getDescription = (item) => {
    let desc

    const cycleTags = (tags) => {
        if (tags) {
            let tagLength = tags.length

            while (!desc && tagLength--) {
                if (tags[tagLength].tag === `desc` || tags[tagLength].tag === `description`) {
                    desc = tags[tagLength].text
                }
            }
        }
    }

    cycleTags(getThis(item, 'comment.tags'))

    if (!desc) {
        cycleTags(getThis(item, 'signatures.0.comment.tags'))
    }

    return desc ? desc.trim() : ``
}

const getReturn = (item, doc) => {
    if (!item) {
        return `void`
    }

    let returns = getThis(item, 'getSignature')

    if (!returns) {
        returns = getThis(item, 'signatures.0')
    }

    if (!returns) {
        returns = item
    }

    if (returns) {

        return getType(returns, doc)
    }

    return `void`
}

const getParameters = (item, doc) => {
    if (!item) {
        return
    }

    let parameters = getThis(item, 'signatures.0.parameters')

    if (!parameters || !parameters.length) {
        return
    }

    parameters = parameters.map(parameter => {
        return {
            name: parameter.name,
            description: getThis(parameter, `comment.text`),
            isOptional: parameter.flags.isOptional,
            type: getType(parameter.type, doc)
        }
    })
    return parameters
}

const joinValues = (item, doc) => {
    let values = item.map(type => {
        return getType(type, doc)
    })

    if (values.length === 1) {
        values = values[0]
    }

    return values
}

const lookupReference = (id, doc) => {
    let src
    let results = {}
    let childLength = doc.children.length

    while (!src && childLength--) {
        let element = doc.children[childLength]

        if (element.id === id && (element.children || element.indexSignature)) {
            src = element
        }
    }

    if (!src) {
        return ``
    }

    if (src.kindString === `Class`) {
        return `${src.name} (Class)`
    }

    if (src.children) {
        src.children.forEach(child => {
            results[child.name] = getType(child.type, doc)
        })

        return results
    }

    if (src.indexSignature) {
        let keyName = getThis(src.indexSignature, `parameters.0.name`)
        let keyType = getThis(src.indexSignature, `parameters.0.type.name`)
        let value = getThis(src.indexSignature, `type`)

        if (value) {
            let _value = getType(value, doc)

            if (_value) {
                value = _value
            }
        }

        if (value && keyName && keyType) {
            results = {}
            results[`[${keyName}:${keyType}]`] = value
            return results
        }
    }

    return getType(src, doc)
}

const getType = (item, doc) => {
    let result = {}

    if (!item) {
        return
    }

    if (item.id && item.type === `reference`) {
        return lookupReference(item.id, doc)
    }

    if (item.type === `reference`) {
        let val

        if (item.types) {
            val = joinValues(item.types, doc)
        }

        if (item.typeArguments) {
            val = joinValues(item.typeArguments, doc)
        }

        if (val) {
            if (item.name === `Array`) {
                return [val]
            }

            return val
        }

        return item.name
    }

    if (item.type === `union`) {
        result = joinValues(item.types, doc)

        if (Array.isArray(result)) {
            result = result.join(` | `)
        }

        return result
    }

    if (item.type && item.type.name) {
        return getType(item.type, doc)
    }

    return item.name
}

const getKind = (item) => {
    let kind = getThis(item, 'decorators.0.name', item.kindString)

    if (getThis(item, 'decorators.0.type.name') === `Input`){
        kind = item.type.name
    }
}

const isDocumented = (item) => {
    if (!item.description) {
        return false
    }

    if (item.hasOwnProperty(`isDocumented`) && !item.isDocumented) {
        return false
    }

    return true
}

const getChildren = (children, doc) => {
    let results = {
        methods: {},
        getters: {},
        properties: {},
        attributeProperties: {}
    }

    if (children && children.length) {
        children.forEach(item => {
            let prop = null
            let child = {
                name: item.name,
                kind: getThis(item, 'decorators.0.name', item.kindString),
                description: getDescription(item),
                required: getThis(item, 'flags.isOptional'),
                exported: getThis(item, 'flags.isExported'),
                source: item.sources[0]
            }

            switch (child.kind) {
                case `Method`:
                    let _isDocumented = true

                    child.returns = getReturn(item, doc)
                    child.arguments = getParameters(item, doc)

                    if (child.arguments) {
                        child.arguments.forEach((arg, argIndex) => {
                            child.arguments[argIndex].isDocumented = isDocumented(arg)

                            if (!child.arguments[argIndex].isDocumented) {
                                _isDocumented = false
                            }
                        })
                    }

                    child.isDocumented = _isDocumented

                    prop = `methods`
                    break
                case `Accessor`:
                    child.returns = getReturn(item, doc)
                    prop = `getters`
                    break
                case `Input`:
                case `Prop`:
                    prop = `attributeProperties`
                    child.default = item.defaultValue ? item.defaultValue.replace(/'|"|`/g, '').trim() : ''
                    child.type = getType(item.type, doc)
                    break
                case `Property`:
                    prop = `properties`
                    child.default = item.defaultValue ? item.defaultValue.replace(/'|"|`/g, '').trim() : ''
                    child.type = getType(item.type, doc)
                    break
            }

            child.isDocumented = isDocumented(child)

            if (prop) {
                if (!results[prop]) {
                    results[prop] = {}
                }

                results[prop][child.name] = child
            } else {
                results[child.name] = child
            }
        })
    }

    if (!Object.keys(results.methods).length) {
        delete results.methods
    }

    if (!Object.keys(results.properties).length) {
        delete results.properties
    }

    if (!Object.keys(results.attributeProperties).length) {
        delete results.attributeProperties
    }

    if (!Object.keys(results.getters).length) {
        delete results.getters
    }

    return results
}

class TypeDock {

    constructor(options) {
        let defaultOptions = {
            outputDirectory: path.resolve(__dirname, `docks`),
            outputFilename: `docks.json`,
            sourceDirectory: path.resolve(__dirname, `./`),
            exclude: `node_modules`,
            tsconfig: path.resolve(__dirname, `tsconfig.json`),
            testDirectory: path.resolve(__dirname, `tests`)
        }

        this.options = Object.assign(defaultOptions, options || {})
    }

    parseDoc(doc) {
        let results = {}

        doc.children.forEach(child => {
            let propertyToAddTo = child.kindString.toLowerCase()
            let name = child.name
            let description = getDescription(child)

            if (getThis(child, 'decorators.0.name') === 'Component') {
                propertyToAddTo = `components`
                name = getComponentName(child)
            }

            if (getThis(child, 'decorators.0.name') === 'NgModule') {
                propertyToAddTo = `modules`
            }

            if (!results[propertyToAddTo]) {
                results[propertyToAddTo] = {}
            }

            results[propertyToAddTo][name] = {
                name: name,
                kind: child.kindString,
                children: getChildren(child.children, doc, child),
                group: propertyToAddTo,
                description
            }

            let _isDocumented = true

            let documentableChildren = [
                `properties`,
                `methods`,
                `attributeProperties`,
                `getters`
            ]

            if (getThis(child, 'decorators.0.name') === 'NgModule') {
                results[propertyToAddTo][name].body = `<pre>${getThis(child, `decorators.0.arguments.obj`)}</pre>`
            }

            for (let p in results[propertyToAddTo][name].children) {
                if (documentableChildren.indexOf(p) > -1 && results[propertyToAddTo][name].children[p]) {
                    for (let c in results[propertyToAddTo][name].children[p]) {
                        if (results[propertyToAddTo][name].children[p][c]) {
                            if (!results[propertyToAddTo][name].children[p][c].isDocumented) {
                                _isDocumented = false
                            }
                        }
                    }
                }
            }

            results[propertyToAddTo][name].isDocumented = _isDocumented
        })

        return results
    }

    generateTypedoc() {

        return new Promise((resolve, reject) => {

            if (!fs.existsSync(this.options.outputDirectory)) {
                fs.mkdirSync(this.options.outputDirectory)
            }

            let command = `typedoc --json ${path.resolve(this.options.outputDirectory, `_` + this.options.outputFilename)}  --entryPoint ${this.options.entryPoint} --includeDeclarations --mode file --excludeExternals --module System --exclude "${this.options.exclude}" --tsconfig ${this.options.tsconfig}`
            console.log(command)
            return exec(command, (err) => {
                if (err) {
                    return reject(err)
                }

                let output = fs.readFileSync(path.resolve(this.options.outputDirectory, `_` + this.options.outputFilename))

                try {
                    output = JSON.parse(output)
                } catch (error) {
                    return reject(error)
                }

                return resolve(output)
            })
        })
    }

    generate() {
        return new Promise((resolve, reject) => {
            return this.generateTypedoc()
                .then(docs => {
                    let parsed = this.parseDoc(docs)

                    if (this.options.excludeTypes && this.options.excludeTypes.length) {
                        this.options.excludeTypes.forEach(type => {
                            if (parsed[type]) {
                                delete parsed[type]
                            }
                        })
                    }

                    if (this.options.includeTypes && this.options.includeTypes.length) {
                        let types = {}

                        this.options.includeTypes.forEach(type => {
                            if (parsed[type]) {
                                types[type] = parsed[type]
                            }
                        })

                        parsed = types
                    }

                    fs.writeFileSync(path.resolve(this.options.outputDirectory, this.options.outputFilename), JSON.stringify(parsed))
                    return resolve(parsed)
                })
                .catch(err => {
                    return reject(err)
                })
        })
    }
}

module.exports = TypeDock