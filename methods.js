import { createApplyFunc, createChainExecutor, handlerMaker } from "./core.js"
import { defaultErrorHandler, giveContext } from "./errors.js"

export function addMethods(type, selector, target) {
  let proxy = null

  const isSingle = type === "$"
  const toOneOrMany = (func) => {
    return isSingle ? func(target) : target.forEach((el) => func(el))
  }

  const addToLocalQueue = createChainExecutor()
  const applyFunc = createApplyFunc(addToLocalQueue, () => proxy)

  const customMethods = {
    on: applyFunc((ev, fn) => {
      toOneOrMany((el) => el.addEventListener(ev, fn))
    }, giveContext("on", selector)),

    once: applyFunc((ev, fn) => {
      toOneOrMany((el) => el.addEventListener(ev, fn, { once: true }))
    }, giveContext("once", selector)),

    off: applyFunc((ev, fn) => {
      toOneOrMany((el) => el.removeEventListener(ev, fn))
    }, giveContext("off", selector)),

    delegate: applyFunc((event, subSelector, handler) => {
      toOneOrMany((el) => delegate(el, event, subSelector, handler))
    }, giveContext("delegate", selector)),

    html: applyFunc((newHtml) => {
      toOneOrMany((el) => (el.innerHTML = newHtml))
    }, giveContext("html", selector)),

    sanitize: applyFunc((newHtml, sanitizer) => {
      toOneOrMany((el) => el.setHTML(newHtml, sanitizer))
    }, giveContext("sanitize", selector)),

    text: applyFunc((newText) => {
      toOneOrMany((el) => (el.textContent = newText))
    }, giveContext("text", selector)),

    val: applyFunc((newValue) => {
      toOneOrMany((el) => {
        setFormElementValue(el, newValue)
      })
    }, giveContext("val", selector)),

    css: applyFunc((stylesOrProp, value) => {
      toOneOrMany((el) => css(el, stylesOrProp, value))
    }, giveContext("css", selector)),

    addStyleSheet, // SAME NAME. This comment is just here cuz this is easy to miss.

    addClass: applyFunc((className) => {
      toOneOrMany((el) => el.classList.add(className))
    }, giveContext("addClass", selector)),

    removeClass: applyFunc((className) => {
      toOneOrMany((el) => el.classList.remove(className))
    }, giveContext("removeClass", selector)),

    toggleClass: applyFunc((className) => {
      toOneOrMany((el) => el.classList.toggle(className))
    }, giveContext("toggleClass", selector)),

    set: applyFunc((attr, value = "") => {
      toOneOrMany((el) => el.setAttribute(attr, value))
    }, giveContext("set", selector)),

    unset: applyFunc((attr) => {
      toOneOrMany((el) => el.removeAttribute(attr))
    }, giveContext("unset", selector)),

    toggle: applyFunc((attr) => {
      toOneOrMany((el) => el.toggleAttribute(attr))
    }, giveContext("toggle", selector)),

    data: applyFunc((key, value) => {
      toOneOrMany((el) => (el.dataset[key] = value))
    }, giveContext("data", selector)),

    append: applyFunc((...children) => {
      toOneOrMany((el) => insertChild(el, "append", ...children))
    }, giveContext("append", selector)),

    prepend: applyFunc((...children) => {
      toOneOrMany((el) => insertChild(el, "prepend", ...children))
    }, giveContext("prepend", selector)),

    cloneTo: applyFunc((parentSelector, options) => {
      moveOrClone(target, parentSelector, { mode: "clone", ...options })
    }, giveContext("cloneTo", selector)),

    moveTo: applyFunc((parentSelector, options) => {
      moveOrClone(target, parentSelector, { mode: "move", ...options })
    }, giveContext("moveTo", selector)),

    replaceWith: applyFunc((replacements, mode = "move") => {
      replaceWith(target, replacements, mode)
    }, giveContext("replaceWith", selector)),

    remove: applyFunc(() => {
      toOneOrMany((el) => el.remove())
    }, giveContext("remove", selector)),

    animate: applyFunc(
      (keyframes, options) =>
        animate(Array.isArray(target) ? target : [target], keyframes, options),
      giveContext("animate", selector)
    ),

    wait: applyFunc(
      (duration) => wait(duration),
      giveContext("wait", selector)
    ),

    do: applyFunc((fn) => {
      toOneOrMany((el) => {
        const wrappedElement = addMethods("$", selector, el)
        fn(wrappedElement)
      })
    }, giveContext("do", selector)),

    parent: () => {
      const elements = isSingle
        ? target.parentElement
        : target.map((el) => el.parentElement)
      return addMethods("$", selector, elements)
    },

    siblings: () => {
      const elements = isSingle
        ? Array.from(target.parentElement.children).filter(
            (el) => el !== target
          )
        : target.map((el) =>
            Array.from(el.parentElement.children).filter(
              (child) => child !== el
            )
          )
      return addMethods("$$", selector, elements)
    },

    closest: (subSelector) => {
      const elements = isSingle
        ? target.closest(subSelector)
        : target.map((el) => el.closest(subSelector))
      return addMethods("$", subSelector, elements)
    },

    find: (subSelector) => {
      const elements = isSingle
        ? target.querySelectorAll(subSelector)
        : target.map((el) => el.querySelectorAll(subSelector))
      return addMethods("$$", subSelector, elements)
    },
  }

  const handler = handlerMaker(target, customMethods)
  proxy = new Proxy(customMethods, handler)

  proxy.isSingle = isSingle
  proxy.raw = target

  return proxy
}

function delegate(element, event, subSelector, handler) {
  element.addEventListener(event, (e) => {
    if (e.target.matches(subSelector)) handler.call(e.target, e)
  })
}

function setFormElementValue(element, value) {
  if (element instanceof HTMLInputElement) {
    const inputTypes = {
      checkbox: () => (element.checked = !!value),
      radio: () => (element.checked = element.value === value),
      file: () => (element.files = value),
      default: () => {
        if (typeof value === "string") element.value = value
      },
    }
    const handler = inputTypes[element.type] || inputTypes.default
    handler()
  } else if (element instanceof HTMLSelectElement) {
    if (element.multiple && Array.isArray(value)) {
      for (let option of element.options) {
        option.selected = value.includes(option.value)
      }
    } else if (typeof value === "string" || typeof value === "number") {
      element.value = value.toString()
    }
  } else if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLButtonElement
  ) {
    element.value = value
  } else {
    element.textContent = value
  }
}

function css(element, stylesOrProp, value) {
  if (typeof stylesOrProp === "string") {
    element.style[stylesOrProp] = value
  } else if (typeof stylesOrProp === "object") {
    Object.assign(element.style, stylesOrProp)
  }
}

function addStyleSheet(rules) {
  const style = document.createElement("style")
  style.textContent = rules
  document.head.appendChild(style)
}

function createDOMFromString(htmlString, sanitize = true) {
  const div = document.createElement("div")
  sanitize ? div.setHTML(htmlString) : (div.innerHTML = htmlString)
  return div.firstElementChild
}

function getDOMElement(item, sanitize = true, all = false) {
  return typeof item === "string" && item.trim().startsWith("<")
    ? createDOMFromString(item, sanitize)
    : item instanceof HTMLElement
    ? item
    : all
    ? Array.from(document.querySelectorAll(item))
    : document.querySelector(item) || null
}

function insertChild(element, operation, ...args) {
  const sanitize = args[args.length - 1] === false ? false : true
  const children = args.filter((arg) => arg !== false)
  children.forEach((child) => {
    const domElement = getDOMElement(child, sanitize)
    domElement && element[operation](domElement)
  })
}

function moveOrClone(elements, parentSelector, options = {}) {
  const {
    mode = "move",
    position = "inside",
    sanitize = true,
    all = false,
  } = options

  let parents = getDOMElement(parentSelector, sanitize, all)

  if (!Array.isArray(parents)) {
    parents = [parents]
  }

  if (!parents.length) return

  const operation = mode === "clone" ? (el) => el.cloneNode(true) : (el) => el
  const children = Array.isArray(elements) ? elements : [elements].flat()

  children.forEach((child) => {
    parents.forEach((parent) => {
      const domElement = operation(getDOMElement(child, sanitize))
      if (position === "inside") {
        parent.append(domElement)
      } else if (position === "before") {
        parent.before(domElement)
      } else if (position === "after") {
        parent.after(domElement)
      }
    })
  })
}

function replaceWith(elements, replacements, mode = "move") {
  elements.isSingle
    ? elements.raw.replaceWith(replacements.raw)
    : elements.raw.forEach((element, index) => {
        const replacement =
          mode === "clone"
            ? replacements.raw[index].cloneNode(true)
            : replacements.raw[index]
        element.replaceWith(replacement)
      })
}

function animate(elements, keyframes, options) {
  const animations = elements.map((element) =>
    element.animate(keyframes, options)
  )
  return Promise.all(animations.map((animation) => animation.finished))
}

function wait(duration) {
  return new Promise((resolve) => setTimeout(resolve, duration))
}