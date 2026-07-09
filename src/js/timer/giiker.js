execMain(function(timer) {
	var enable = false;
	var enableVRC = false;
	var waitReadyTid = 0;
	var moveReadyTid = 0;
	var insTime = 0;
	var div = $('<div />');
	var totPhases = 1;
	var currentFacelet = mathlib.SOLVED_FACELET;
	var rawMoves = [];

	var giikerVRC = (function() {
		var isReseted = false;
		var curVRCCubie = new mathlib.CubieCube();
		var tmpCubie1 = new mathlib.CubieCube();
		var puzzleObj;
		var curOri = -1;
		var gyroPreviewBaseInv = null;
		var lastGyroPreviewRender = 0;
		var GYRO_PREVIEW_RENDER_MS = 16;
		var GYRO_PREVIEW_ZERO_QUAT = {
			x: 0.7071067811865476,
			y: 0,
			z: 0.7071067811865476,
			w: 0
		};

		function resetVRC(temp, force) {
			if ((isReseted && !force) || !enableVRC) {
				return;
			}
			var options = {
				puzzle: "cube3",
				style: kernel.getProp('giiVRC')
			};
			puzzleFactory.init(options, $.noop, div, function(ret, isInit) {
				puzzleObj = ret;
				if (isInit && !puzzleObj) {
					div.css('height', '');
					div.html('--:--');
				}
				if (!temp || isInit) {
					timer.lcd.fixDisplay(false, true);
					setSize(kernel.getProp('timerSize'));
				}
				curVRCCubie.fromFacelet(mathlib.SOLVED_FACELET);
				if (!puzzleObj) {
					return;
				}
				gyroPreviewBaseInv = null;
				puzzleObj.setGyroQuaternion && puzzleObj.setGyroQuaternion({ x: 0, y: 0, z: 0, w: 1 });
				var preScramble = puzzleObj.parseScramble('U2 U2', true);
				curVRCCubie.ori = 0;
				for (var i = 0; i < preScramble.length; i++) {
					curVRCCubie.selfMoveStr(puzzleObj.move2str(preScramble[i]));
				}
				puzzleObj.applyMoves(preScramble); // process pre scramble (cube orientation)
				var targetOri = kernel.getProp('giiOri');
				targetOri = targetOri == 'auto' ? -1 : ~~targetOri;
				setOri(targetOri);
				if (gyroPreviewActive) {
					setGyroGripPose();
				}
			});
			isReseted = true;
		}

		function setSize(value) {
			div.css('height', value * $('#logo').width() / 9 + 'px');
			puzzleObj && puzzleObj.resize();
		}

		function setState(state, prevMoves, isFast) {
			if (puzzleObj == undefined || !enableVRC) {
				return;
			}
			tmpCubie1.fromFacelet(state);
			var todoMoves = [];
			var shouldReset = true;
			for (var i = 0; i < prevMoves.length; i++) {
				todoMoves.push(prevMoves[i]);
				tmpCubie1.selfMoveStr(prevMoves[i], true);
				if (tmpCubie1.isEqual(curVRCCubie)) {
					shouldReset = false;
					break;
				}
			}
			if (shouldReset) { //cannot get current state according to prevMoves
				resetVRC(false);
				curVRCCubie.fromFacelet(mathlib.SOLVED_FACELET);
				todoMoves = scramble_333.genFacelet(state);
			} else {
				todoMoves = todoMoves.reverse().join(' ');
			}
			var scramble;
			if (todoMoves.match(/^\s*$/) || !puzzleObj) {
				scramble = [];
			} else {
				scramble = puzzleObj.parseScramble(cubeutil.getConjMoves(todoMoves, true, curVRCCubie.ori));
			}
			if (scramble.length < 5) {
				puzzleObj.addMoves(scramble);
			} else {
				puzzleObj.applyMoves(scramble);
			}
			isReseted = false;
			curVRCCubie.fromFacelet(state);
		}

		function setOri(ori) {
			curOri = ori;
			if (curOri == -1 || curVRCCubie.ori == curOri) {
				return;
			}
			var todoRot = mathlib.CubieCube.rotMulI[curOri][curVRCCubie.ori];
			var todoMoves = mathlib.CubieCube.rot2str[todoRot].split(/\s+/);
			for (var i = 0; i < todoMoves.length; i++) {
				curVRCCubie.selfMoveStr(todoMoves[i]);
			}
			puzzleObj.applyMoves(puzzleObj.parseScramble(todoMoves.join(' ')));
		}

		function invertQuat(quat) {
			return {
				x: -quat.x,
				y: -quat.y,
				z: -quat.z,
				w: quat.w
			};
		}

		function mulQuat(a, b) {
			return {
				x: a.x * b.w + a.w * b.x + a.y * b.z - a.z * b.y,
				y: a.y * b.w + a.w * b.y + a.z * b.x - a.x * b.z,
				z: a.z * b.w + a.w * b.z + a.x * b.y - a.y * b.x,
				w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z
			};
		}

		function normalizeQuat(quat) {
			var norm = Math.sqrt(quat.x * quat.x + quat.y * quat.y + quat.z * quat.z + quat.w * quat.w);
			if (norm > 0.01) {
				quat.x /= norm;
				quat.y /= norm;
				quat.z /= norm;
				quat.w /= norm;
			}
			return quat;
		}

		function setGyroQuaternion(quat, locTime) {
			if (!puzzleObj || !enableVRC || !quat || !puzzleObj.setGyroQuaternion) {
				return false;
			}
			locTime = locTime || $.now();
			if (locTime - lastGyroPreviewRender < GYRO_PREVIEW_RENDER_MS) {
				return true;
			}
			lastGyroPreviewRender = locTime;
			if (!gyroPreviewBaseInv) {
				gyroPreviewBaseInv = invertQuat(quat);
			}
			puzzleObj.setGyroQuaternion(normalizeQuat(mulQuat(mulQuat(quat, gyroPreviewBaseInv), GYRO_PREVIEW_ZERO_QUAT)));
			return true;
		}

		function setGyroGripPose() {
			if (!puzzleObj || !enableVRC || !puzzleObj.setGyroQuaternion) {
				return false;
			}
			puzzleObj.setGyroQuaternion(GYRO_PREVIEW_ZERO_QUAT);
			return true;
		}

		function resetGyroQuaternion() {
			gyroPreviewBaseInv = null;
			lastGyroPreviewRender = 0;
			puzzleObj && puzzleObj.setGyroQuaternion && puzzleObj.setGyroQuaternion({ x: 0, y: 0, z: 0, w: 1 });
		}

		return {
			resetVRC: resetVRC, //reset to solved
			setState: setState,
			setOri: setOri,
			setGyroQuaternion: setGyroQuaternion,
			setGyroGripPose: setGyroGripPose,
			resetGyroQuaternion: resetGyroQuaternion,
			setSize: setSize
		}
	})();

	function clearReadyTid() {
		if (waitReadyTid) {
			clearTimeout(waitReadyTid);
			waitReadyTid = 0;
		}
		if (moveReadyTid) {
			clearTimeout(moveReadyTid);
			moveReadyTid = 0;
		}
	}

	function giikerCallback(facelet, prevMoves, lastTs) {
		var locTime = lastTs[1] || $.now();
		var prevFacelet = currentFacelet;
		currentFacelet = facelet;
		if (!enable) {
			return;
		}
		if (enableVRC) {
			giikerVRC.setState(facelet, prevMoves, false);
		}
		clearReadyTid();
		var solvingMethod = kernel.getProp('vrcMP', 'n');
		if (timer.status() == -1) {
			if (canStart(currentFacelet)) {
				var delayStart = kernel.getProp('giiSD');
				if (delayStart == 's') {
					//according to scramble
					if (giikerutil.checkScramble()) {
						markScrambled(locTime);
					}
				} else if (delayStart != 'n') {
					waitReadyTid = setTimeout(function() {
						markScrambled(locTime);
					}, ~~delayStart * 1000);
				}
				var moveStart = kernel.getProp('giiSM');
				if (moveStart != 'n') {
					var movere = {
						'x4': /^([URFDLB][ '])\1\1\1/,
						'xi2': /^([URFDLB])( \1'\1 \1'|'\1 \1'\1 )/
					} [moveStart];
					if (movere.exec(prevMoves.join(''))) {
						moveReadyTid = setTimeout(function() {
							markScrambled(locTime);
						}, 1000);
					}
				}
			}
		} else if (timer.status() == -3 || timer.status() == -2) {
			if (timer.checkUseIns()) {
				insTime = locTime - timer.startTime();
			} else {
				insTime = 0;
			}
			timer.startTime(locTime);
			timer.curTime([insTime > 17000 ? -1 : (insTime > 15000 ? 2000 : 0)]);
			timer.status(cubeutil.getStepCount(solvingMethod));
			rawMoves = [];
			for (var i = 0; i < timer.status(); i++) {
				rawMoves[i] = [];
			}
			totPhases = timer.status();
			var initialProgress = cubeutil.getProgress(prevFacelet, solvingMethod);
			timer.updateMulPhase(totPhases, initialProgress, locTime);
			timer.lcd.reset(enableVRC);
			timer.lcd.fixDisplay(false, true);
			if (gyroAutoSync) {
				startAutoGyroCapture();
			}
		}
		if (timer.status() >= 1) {
			if (prevMoves.length > 0)
				rawMoves[timer.status() - 1].push([prevMoves[0], lastTs[0], lastTs[1]]);
			var curProgress = cubeutil.getProgress(facelet, solvingMethod);
			timer.updateMulPhase(totPhases, curProgress, locTime);

			if (isGiiSolved(currentFacelet)) {
				rawMoves.reverse();
				var pretty = cubeutil.getPrettyReconstruction(rawMoves, solvingMethod);
				var moveCnt = pretty.totalMoves;
				giikerutil.setLastSolve(pretty.prettySolve);
				timer.curTime()[1] = locTime - timer.startTime();
				timer.status(-1);
				giikerutil.reSync();
				timer.lcd.fixDisplay(false, true);
				if (timer.curTime()[1] != 0) {
					var sol = giikerutil.tsLinearFix(rawMoves.flat()); // fit deviceTime to locTime
					var cnt = 0;
					DEBUG && console.log('time fit, old=', timer.curTime());
					for (var i = 0; i < rawMoves.length; i++) {
						cnt += rawMoves[i].length;
						timer.curTime()[rawMoves.length - i] = cnt == 0 ? 0 : sol[cnt - 1][1];
					}
					DEBUG && console.log('time fit, new=', timer.curTime());
					sol = cubeutil.getConjMoves(cubeutil.moveSeq2str(sol), true);
					kernel.pushSignal('time', ["", 0, timer.curTime(), 0, [sol, '333']]);
				} else if (kernel.getProp('giiMode') != 'n') {
					kernel.pushSignal('ctrl', ['scramble', 'next']);
				}
			}
		}
	}

	function canStart(facelet) {
		return facelet != mathlib.SOLVED_FACELET || kernel.getProp('giiMode') != 'n';
	}

	function isGiiSolved(facelet) {
		if (kernel.getProp('giiMode') != 'n') {
			var curScrType = (tools.getCurScramble() || [])[0];
			var chkstep = {
				'coll': 'cpll',
				'cmll': 'cmll',
				'oll': 'oll',
				'eols': 'oll',
				'wvls': 'oll',
				'zbls': 'eoll',
				'f2l': 'f2l',
				'lsll2': 'f2l'
			}[curScrType];
			if (chkstep) {
				return cubeutil.getStepProgress(chkstep, facelet) == 0;
			}
		}
		return facelet == mathlib.SOLVED_FACELET;
	}

	function markScrambled(now) {
		clearReadyTid();
		if (timer.status() == -1) {
			if (kernel.getProp('giiMode') == 'n') {
				if (!giikerutil.checkScramble()) {
					var gen = scramble_333.genFacelet(currentFacelet);
					kernel.pushSignal('scramble', ['333', cubeutil.getConjMoves(gen, true), 0]);
				}
				giikerutil.markScrambled();
			} else {
				giikerutil.markScrambled(true);
			}
			timer.status(-2);
			timer.startTime(now);
			timer.lcd.reset(enableVRC);
			timer.lcd.fixDisplay(true, true);
			if (kernel.getProp('giiBS')) {
				metronome.playTick();
			}
		}
	}

	function setVRC(enable) {
		enableVRC = enable;
		enable ? div.show() : div.hide();
		if (enable) {
			giikerVRC.resetVRC(true, true);
			startAutoGyroSync();
		} else {
			stopAutoGyroSync();
		}
	}

	var gyroPreviewTid = 0;
	var gyroPreviewActive = false;
	var gyroPreviewCaptureActive = false;
	var gyroAutoSync = false;
	var gyroAutoCaptureActive = false;
	var gyroDisplayActive = false;
	var prevGyroHandler = null;

	function resetGyroDisplay() {
		gyroDisplayActive = false;
		giikerVRC.resetGyroQuaternion();
	}

	function onMoyu32Gyro(data) {
		if (prevGyroHandler) {
			prevGyroHandler(data);
		}
		if (!data || !data.quaternion) {
			return;
		}
		if (gyroPreviewActive || gyroAutoSync) {
			gyroDisplayActive = true;
			giikerVRC.setGyroQuaternion(data.quaternion, data.locTime);
		} else if (gyroDisplayActive) {
			resetGyroDisplay();
		}
	}

	function installGyroHandler() {
		if (typeof window == 'undefined') {
			return false;
		}
		if (window.moyu32GyroHandler !== onMoyu32Gyro) {
			prevGyroHandler = window.moyu32GyroHandler || null;
			window.moyu32GyroHandler = onMoyu32Gyro;
		}
		return true;
	}

	function uninstallGyroHandler() {
		if (typeof window == 'undefined' || window.moyu32GyroHandler !== onMoyu32Gyro) {
			return;
		}
		if (prevGyroHandler !== null) {
			window.moyu32GyroHandler = prevGyroHandler;
			prevGyroHandler = null;
		} else {
			delete window.moyu32GyroHandler;
		}
	}

	function startAutoGyroSync() {
		if (!enable || !enableVRC || kernel.getProp('giiVRC') != 'v' || typeof window == 'undefined' || typeof window.moyu32CaptureGyro != 'function') {
			return Promise.resolve(false);
		}
		gyroAutoSync = true;
		installGyroHandler();
		giikerVRC.setGyroGripPose();
		return startAutoGyroCapture();
	}

	function startAutoGyroCapture() {
		if (!gyroAutoSync || gyroAutoCaptureActive || typeof window == 'undefined' || typeof window.moyu32CaptureGyro != 'function') {
			return Promise.resolve(false);
		}
		if (!GiikerCube.isConnected()) {
			return Promise.resolve(false);
		}
		installGyroHandler();
		gyroAutoCaptureActive = true;
		return window.moyu32CaptureGyro(0, { 'silent': true, 'persistent': true }).catch(function() {
			gyroAutoCaptureActive = false;
			if (!gyroPreviewActive) {
				uninstallGyroHandler();
			}
			return false;
		});
	}

	function stopAutoGyroSync() {
		gyroAutoSync = false;
		return stopAutoGyroCapture(true);
	}

	function stopAutoGyroCapture(clearHandler) {
		var wasActive = gyroAutoCaptureActive;
		gyroAutoCaptureActive = false;
		if (gyroPreviewActive) {
			return Promise.resolve();
		}
		if (clearHandler) {
			uninstallGyroHandler();
		}
		resetGyroDisplay();
		if (wasActive && typeof window != 'undefined' && typeof window.moyu32StopGyroCapture == 'function') {
			return window.moyu32StopGyroCapture();
		}
		return Promise.resolve();
	}

	function stopGyroPreview() {
		if (gyroPreviewTid) {
			clearTimeout(gyroPreviewTid);
			gyroPreviewTid = 0;
		}
		var stopPreviewCapture = gyroPreviewCaptureActive;
		gyroPreviewActive = false;
		gyroPreviewCaptureActive = false;
		if (gyroAutoCaptureActive) {
			return Promise.resolve();
		}
		if (!gyroAutoSync) {
			uninstallGyroHandler();
		}
		resetGyroDisplay();
		if (stopPreviewCapture && typeof window != 'undefined' && typeof window.moyu32StopGyroCapture == 'function') {
			return window.moyu32StopGyroCapture();
		}
		return Promise.resolve();
	}

	function previewGyro(duration) {
		if (typeof window == 'undefined' || typeof window.moyu32CaptureGyro != 'function') {
			return Promise.reject('[giiker] WCU gyro capture is not available');
		}
		if (!enableVRC) {
			return Promise.reject('[giiker] Enable Bluetooth virtual cube first');
		}
		duration = Math.max(500, Math.min(30000, ~~duration || 5000));
		giikerVRC.resetVRC(true, true);
		resetGyroDisplay();
		giikerVRC.setGyroGripPose();
		gyroPreviewActive = true;
		gyroDisplayActive = true;
		installGyroHandler();
		if (gyroPreviewTid) {
			clearTimeout(gyroPreviewTid);
		}
		gyroPreviewTid = setTimeout(stopGyroPreview, duration + 200);
		if (gyroAutoCaptureActive) {
			return Promise.resolve(true);
		}
		gyroPreviewCaptureActive = true;
		return window.moyu32CaptureGyro(duration, { 'silent': true }).catch(function(err) {
			gyroPreviewCaptureActive = false;
			gyroPreviewActive = false;
			throw err;
		});
	}

	$(function() {
		div.appendTo("#container");
		kernel.regListener('giikerVRC', 'property', function(signal, value) {
			if (enableVRC) {
				giikerVRC.resetVRC(true, true);
				giikerVRC.setState(currentFacelet, ['U2', 'U2'], false);
			}
		}, /^(?:preScrT?|isTrainScr|giiOri)$/);
		kernel.regListener('giikerVRC', 'scramble', function(signal, value) {
			if (enableVRC && timer.status() == -1 && kernel.getProp('giiMode') == 'at' && GiikerCube.isConnected()) {
				clearReadyTid();
				waitReadyTid = setTimeout(function() {
					markScrambled($.now());
				}, 500);
			}
		});
	});

	function startConnect() {
		giikerutil.setCallback(giikerCallback);
		kernel.showDialog([$('<div>Press OK To Connect To Bluetooth Cube</div>').append(timer.getBTDiv()), function () {
			giikerutil.init().then(function() {
				return startAutoGyroSync();
			}).catch(function(error) {
				giikerutil.log('[giiker] init failed', error);
				alert(error);
			});
		}, 0, 0], 'share', 'Bluetooth Connect');
	}

	timer.giiker = {
		setEnable: function(input) { //s: stackmat, m: moyu
			enable = input == 'g';
			if (enable && !GiikerCube.isConnected()) {
				startConnect();
			} else if (!enable) {
				stopAutoGyroSync();
				giikerutil.stop();
			} else if (enable) {
				startAutoGyroSync();
			}
			setVRC(enable && kernel.getProp('giiVRC') != 'n');
		},
		onkeydown: function(keyCode) {
			var now = $.now();
			if (keyCode == 27 || keyCode == 28) {
				var recordDNF = timer.status() >= 1;
				clearReadyTid();
				timer.status(-1);
				giikerutil.reSync();
				timer.lcd.fixDisplay(false, true);
				if (recordDNF) {
					timer.curTime()[0] = -1;
					rawMoves.reverse();
					var sol = giikerutil.tsLinearFix(rawMoves.flat()); // fit deviceTime to locTime
					var cnt = 0;
					DEBUG && console.log('time fit, old=', timer.curTime());
					for (var i = 0; i < rawMoves.length; i++) {
						cnt += rawMoves[i].length;
						timer.curTime()[rawMoves.length - i] = cnt == 0 ? 0 : sol[cnt - 1][1];
					}
					DEBUG && console.log('time fit, new=', timer.curTime());
					sol = cubeutil.getConjMoves(cubeutil.moveSeq2str(sol), true);
					kernel.pushSignal('time', ["", 0, timer.curTime(), 0, [sol, '333']]);
				}
			} else if (keyCode == 32 && timer.status() == -1 && kernel.getProp('giiSK') && canStart(currentFacelet)) {
				markScrambled($.now());
			}
		},
		onkeyup: function(keyCode) {
			if (enable && keyCode == 32 && !GiikerCube.isConnected()) {
				startConnect();
			}
		},
		setVRC: setVRC,
		setSize: giikerVRC.setSize
	};

	if (typeof window != 'undefined') {
		window.moyu32EnableGyroSync = startAutoGyroSync;
		window.moyu32DisableGyroSync = stopAutoGyroSync;
		window.moyu32PreviewGyro = previewGyro;
		window.moyu32StopGyroPreview = stopGyroPreview;
	}
}, [timer]);
