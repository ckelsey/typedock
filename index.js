import path from 'path'
import fs from 'fs'
import { exec } from 'child_process'

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

class TypeDock {
    options = {
        outputDirectory: path.resolve(__dirname, `docks`),
        outputFilename: `docks.json`,
        sourceDirectory: path.resolve(__dirname, `./`),
        exclude: `node_modules`,
        tsconfig: path.resolve(__dirname, `.tsconfig.json`)
    }

    constructor(options) {
        this.options = Object.assign(this.options, options || {})
    }

    generateTypedoc() {

        return new Promise((resolve, reject) => {

            if (!fs.existsSync(this.options.outputDirectory)) {
                fs.mkdirSync(this.options.outputDirectory)
            }

            let command = `typedoc --json ${path.resolve(this.options.outputDirectory, this.options.outputFilename)} ${this.options.sourceDirectory} --exclude ${this.options.exclude} --tsconfig ${this.options.tsconfig} --excludeExternals --includeDeclarations --ignoreCompilerErrors --target ES5 --mode file`

            exec(command, (err) => {
                if (err) {
                    return reject(err)
                }

                let output = fs.readFileSync(path.resolve(this.options.outputDirectory, this.options.outputFilename))

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
                    resolve(docs)
                })
                .catch(err => {
                    reject(err)
                })
        })
    }
}

export default TypeDock