/**
 * 副作用函数概念 会产生副作用的函数
 * 1. 简单副作用函数
 * 2. 响应式和副作用函数结合
 *    1. 使用proxy实现响应式
 * 3. 完善响应式系统
 *    1. 问题: 硬编码effect
 *       解决: 提供一个注册副作用函数的机制
 *    2. 问题: 在改变obj中其他未读取的变量时也会触发副作用执行 target -> effect
 *       解决: 改变存储结构WeakMap(target) -> Map(key) -> Set(effect)
 *
 */
// 存储副作用函数的桶
// -- const bucket = new Set()
const bucket = new WeakMap()

// 原始值
// const data = { ok: true, text: 'hello wold' }
const data = { foo: 1, bar: 2 }
// 存储当前激活的effect函数
let activeEffect

// effect 栈
const effectStack = []
// 对原始数据的代理
const obj = new Proxy(data, {
	/**
	 * 读取数据时触发
	 * 1. 简单实现收集副作用函数
	 */
	get(target, key) {
		track(target, key)
		return target[key]
	},
	/**
	 * 设置数据时触发
	 * 1. 简单实现将副作用函数从桶中取出并执行
	 */
	set(target, key, newVal) {
		target[key] = newVal
		trigger(target, key)
	},
})

// 在get拦截函数内调用track函数追踪变化
function track(target, key) {
	if (!activeEffect) return target[key]

	let depsMap = bucket.get(target)
	if (!depsMap) {
		bucket.set(target, (depsMap = new Map()))
	}
	let deps = depsMap.get(key)
	if (!deps) {
		depsMap.set(key, (deps = new Set()))
	}

	deps.add(activeEffect)
	activeEffect.deps.push(deps)
}
// 在set拦截函数内调用trigger函数触发变化
function trigger(target, key) {
	let depsMap = bucket.get(target)
	if (!depsMap) return
	const effects = depsMap.get(key)
	const effectsToRun = new Set()
	effects &&
		effects.forEach((effectFn) => {
			if (effectFn !== activeEffect) {
				effectsToRun.add(effectFn)
			}
		})

	effectsToRun.forEach((effectFn) => {
		if (effectFn.options.scheduler) {
			effectFn.options.scheduler(effectFn)
		} else {
			effectFn()
		}
	})
	// effects && effects.forEach((fn) => fn())
}

function cleanup(effectFn) {
	for (let i = 0; i < effectFn.deps.length; i++) {
		const deps = effectFn.deps[i]
		deps.delete(effectFn)
	}
	effectFn.deps.length = 0
}

// 注册副作用函数
function effect(fn, options = {}) {
	// -- document.body.innerText = obj.text
	function effectFn() {
		cleanup(effectFn)
		activeEffect = effectFn
		effectStack.push(effectFn)
		const res = fn()
		effectStack.pop()
		activeEffect = effectStack[effectStack.length - 1]
		return res
	}
	effectFn.options = options
	effectFn.deps = []
	if (!options.lazy) {
		effectFn()
	}
	return effectFn
}
// 定义一个队列
const jobQueue = new Set()

const p = Promise.resolve()

let isFlushing = false
function flushJob() {
	if (isFlushing) return

	isFlushing = true
	p.then(() => {
		jobQueue.forEach((job) => job())
	}).finally(() => {
		isFlushing = false
	})
}

function computed(getter) {
	// value用来缓存上一次计算的值
	let value
	// 用来标识是否需要重新计算,为true需要重新计算
	let dirty = true
	const effectFn = effect(getter, {
		lazy: true,
		// 当值发生改变的时候触发执行调度器
		scheduler() {
			if (!dirty) {
				dirty = true
				trigger(obj, 'value')
			}
		},
	})

	const obj = {
		get value() {
			if (dirty) {
				value = effectFn()
				dirty = false
			}
			track(obj, 'value')
			return value
		},
	}
	return obj
}

// const effectFn = effect(() => obj.foo, {
// 	lazy: true,
// })
// const value = effectFn()

// obj.foo++
const sumRes = computed(() => obj.foo + obj.bar)
console.log('🚀 ~ file: index.js:148 ~ sumRes ~ sumRes', sumRes.value)
// effect(() => {
// 	console.log(sumRes.value)
// })
// obj.foo++
console.log('bucket', bucket)
