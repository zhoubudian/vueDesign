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
	if (!activeEffect) return

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
	// debugger
	// value用来缓存上一次计算的值
	let _value
	// 用来标识是否需要重新计算,为true需要重新计算
	let dirty = true
	const effectFn = effect(getter, {
		lazy: true,
		// 当值发生改变的时候触发执行调度器
		scheduler() {
			// console.log(13123)
			if (!dirty) {
				dirty = true
				trigger(obj, 'value')
			}
		},
	})
	// activeEffect = effectFn

	const obj = {
		get value() {
			if (dirty) {
				_value = effectFn()
				dirty = false
			}
			// console.log('🚀 ~ file: index.js:146 ~ objputed ~ obj', this)
			// activeEffect = effectFn
			track(obj, 'value')
			return _value
		},
	}
	return obj
}


function watch(source, cb, options = {}) {
	// 定义getter
	let getter;
	// 如果source 是函数,说明用户传递的是getter 所以直接把source赋值给getter
	if(typeof source === 'function'){
		getter = source
	} else {
		// 按照原来的实现调用
		getter = () => traverse(source)
	}
	// 定义新值和旧值
	let oldValue,newValue;
	// 提取scheduler调度函数为一个独立的job函数
	const job = () => {
		newValue = effectFn()
		// 将新旧值传作为回调函数的参数
		cb(newValue, oldValue)
		// 更新旧值
		oldValue = newValue
	}
	// 使用effect注册副作用函数,开启lazy选项, 并把返回值存储到effectFn中后面调用使用
	//  flush?: 'pre' | 'post' | 'sync'
	// 源码地址 https://github.com/vuejs/core/blob/main/packages/runtime-core/src/apiWatch.ts
	const effectFn = effect(() => getter(), {
		lazy: true,
		scheduler:() => {
			// 在调度函数中判断flush是否为post, 是将它放入到微任务队列中执行
			if (options.flush === 'post') {
				const p = Promise.resolve()
				p.then(job)
			} else {
				job()
			}
		},
	})
	if(options.immediate) {
		// 当immediate为true时立即执行job, 触发回调执行
		job()
	} else {
		// 手动调用副作用函数,拿到旧值
	  oldValue = effectFn()
	}
	
}
function traverse(value, seen = new Set()) {
	// 通过递归读取 触发track收集依赖
	if (typeof value !== 'object' || value === null || seen.has(value)) return
	seen.add(value)
	// 如果value是一个对象
	for (const k in value) {
		traverse(value[k], seen)
	}
	console.log(seen, '------------->seen')
	return value
}

watch(obj, () => {
	console.log('变化了')
},{
	immediate:true
})

// watch(
// 	() => obj.foo, 
// 	(newValue,oldValue) => {
// 		console.log("🚀 ~ file: index.js:226 ~ oldValue", oldValue)
// 		console.log("🚀 ~ file: index.js:226 ~ newValue", newValue)
// 		console.log('watch obj.foo 的值变了')
//   }
// )

// obj.foo++
// obj.foo++
// obj.bar++

