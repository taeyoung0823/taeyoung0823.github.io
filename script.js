async function setupCamera() {
    const video = document.getElementById('video');
    const stream = await navigator.mediaDevices.getUserMedia({
        video: {
            width: { ideal: 720 },
            height: { ideal: 1280 },
            facingMode: "user"
        }
    });
    video.srcObject = stream;
    return new Promise((resolve) => {
        video.onloadedmetadata = () => {
            video.width = video.videoWidth;
            video.height = video.videoHeight;
            resolve(video);
        };
    });
}

async function setupPoseNet(video) {
    const net = await posenet.load();
    return net;
}

function calculateAngle(a, b, c) {
    const ab = [b.x - a.x, b.y - a.y];
    const bc = [c.x - b.x, c.y - b.y];
    const dotProduct = ab[0] * bc[0] + ab[1] * bc[1];
    const magnitudeAB = Math.sqrt(ab[0] * ab[0] + ab[1] * ab[1]);
    const magnitudeBC = Math.sqrt(bc[0] * bc[0] + bc[1] * bc[1]);
    const angle = Math.acos(dotProduct / (magnitudeAB * magnitudeBC));
    return angle * (180 / Math.PI);
}

function evaluateSquat(angle) {
    if (80 <= angle && angle <= 100) {
        return "Perfect";
    } else if ((70 <= angle && angle < 80) || (100 < angle && angle <= 110)) {
        return "Good";
    } else if ((60 <= angle && angle < 70) || (110 < angle && angle <= 120)) {
        return "Soso";
    } else {
        return "Bad";
    }
}

function evaluateLunge(frontKneeAngle, backKneeAngle) {
    const frontKneeEval = frontKneeAngle >= 80 && frontKneeAngle <= 100 ? "Perfect" :
        (frontKneeAngle >= 70 && frontKneeAngle < 80) || (frontKneeAngle > 100 && frontKneeAngle <= 110) ? "Good" :
        (frontKneeAngle >= 60 && frontKneeAngle < 70) || (frontKneeAngle > 110 && frontKneeAngle <= 120) ? "Soso" : "Bad";

    const backKneeEval = backKneeAngle >= 160 && backKneeAngle <= 180 ? "Perfect" :
        (backKneeAngle >= 150 && backKneeAngle < 160) ? "Good" :
        (backKneeAngle >= 140 && backKneeAngle < 150) ? "Soso" : "Bad";

    return frontKneeEval === "Perfect" && backKneeEval === "Perfect" ? "Perfect" :
        frontKneeEval === "Good" || backKneeEval === "Good" ? "Good" :
        frontKneeEval === "Soso" || backKneeEval === "Soso" ? "Soso" : "Bad";
}

function evaluateShoulderPress(elbowAngle) {
    if (160 <= elbowAngle && elbowAngle <= 180) {
        return "Perfect";
    } else if (150 <= elbowAngle && elbowAngle < 160) {
        return "Good";
    } else if (140 <= elbowAngle && elbowAngle < 150) {
        return "Soso";
    } else {
        return "Bad";
    }
}

function evaluateDumbbellCurl(elbowAngle) {
    if (60 <= elbowAngle && elbowAngle <= 80) {
        return "Perfect";
    } else if ((50 <= elbowAngle && elbowAngle < 60) || (80 < elbowAngle && elbowAngle <= 90)) {
        return "Good";
    } else if ((40 <= elbowAngle && elbowAngle < 50) || (90 < elbowAngle && elbowAngle <= 100)) {
        return "Soso";
    } else {
        return "Bad";
    }
}

async function detectPose(video, net) {
    const canvas = document.getElementById('output');
    const ctx = canvas.getContext('2d');
    
    canvas.width = video.width;
    canvas.height = video.height;

    let lastCountTime = Date.now();
    let count = 0;
    const countDisplay = document.getElementById('count');
    const exerciseSelect = document.getElementById('exercise');
    let selectedExercise = exerciseSelect.value;

    exerciseSelect.addEventListener('change', () => {
        selectedExercise = exerciseSelect.value;
        count = 0;
        countDisplay.innerText = `Count: ${count}`;
    });

    const recentAngles = [];
    const maxRecentAngles = 10;
    async function poseDetectionFrame() {
        const pose = await net.estimateSinglePose(video, {
            flipHorizontal: false
        });
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        if (pose) {
            drawKeypoints(pose.keypoints, 0.6, ctx);
            drawSkeleton(pose.keypoints, 0.7, ctx);

            if (selectedExercise === 'squat') {
                const leftKnee = pose.keypoints.find(point => point.part === 'leftKnee' && point.score > 0.5);
                const leftHip = pose.keypoints.find(point => point.part === 'leftHip' && point.score > 0.5);
                const leftAnkle = pose.keypoints.find(point => point.part === 'leftAnkle' && point.score > 0.5);
                const rightKnee = pose.keypoints.find(point => point.part === 'rightKnee' && point.score > 0.5);
                const rightHip = pose.keypoints.find(point => point.part === 'rightHip' && point.score > 0.5);
                const rightAnkle = pose.keypoints.find(point => point.part === 'rightAnkle' && point.score > 0.5);

                if (leftKnee && leftHip && leftAnkle) {
                    const leftKneeAngle = calculateAngle(leftHip.position, leftKnee.position, leftAnkle.position);
                    recentAngles.push(leftKneeAngle);

                    if (recentAngles.length > maxRecentAngles) {
                        recentAngles.shift();
                    }

                    const averageAngle = recentAngles.reduce((sum, angle) => sum + angle, 0) / recentAngles.length;
                    const squatEvaluation = evaluateSquat(averageAngle);
                    console.log(`Squat Evaluation: ${squatEvaluation}, Left Knee Angle: ${averageAngle.toFixed(2)}`);

                    ctx.font = "30px Arial";
                    ctx.fillStyle = "red";
                    ctx.fillText(`Squat: ${squatEvaluation}`, 10, 50);

                    const currentTime = Date.now();
                    if (squatEvaluation === "Perfect" && currentTime - lastCountTime > 2000) {
                        count += 1;
                        lastCountTime = currentTime;
                    }
                }
                if (rightKnee && rightHip && rightAnkle) {
                    const rightKneeAngle = calculateAngle(rightHip.position, rightKnee.position, rightAnkle.position);
                    recentAngles.push(rightKneeAngle);

                    if (recentAngles.length > maxRecentAngles) {
                        recentAngles.shift();
                    }

                    const averageAngle = recentAngles.reduce((sum, angle) => sum + angle, 0) / recentAngles.length;
                    const squatEvaluation = evaluateSquat(averageAngle);
                    console.log(`Squat Evaluation: ${squatEvaluation}, Right Knee Angle: ${averageAngle.toFixed(2)}`);

                    ctx.font = "30px Arial";
                    ctx.fillStyle = "red";
                    ctx.fillText(`Squat: ${squatEvaluation}`, 10, 50);

                    const currentTime = Date.now();
                    if (squatEvaluation === "Perfect" && currentTime - lastCountTime > 2000) {
                        count += 1;
                        lastCountTime = currentTime;
                    }
                }
            } else if (selectedExercise === 'lunge') {
                const leftKnee = pose.keypoints.find(point => point.part === 'leftKnee' && point.score > 0.5);
                const leftHip = pose.keypoints.find(point => point.part === 'leftHip' && point.score > 0.5);
                const leftAnkle = pose.keypoints.find(point => point.part === 'leftAnkle' && point.score > 0.5);
                const rightKnee = pose.keypoints.find(point => point.part === 'rightKnee' && point.score > 0.5);
                const rightAnkle = pose.keypoints.find(point => point.part === 'rightAnkle' && point.score > 0.5);
                const rightHip = pose.keypoints.find(point => point.part === 'rightHip' && point.score > 0.5);

                if (leftKnee && leftHip && leftAnkle && rightKnee && rightAnkle && rightHip) {
                    const frontKneeAngle = calculateAngle(leftHip.position, leftKnee.position, leftAnkle.position);
                    const backKneeAngle = calculateAngle(rightHip.position, rightKnee.position, rightAnkle.position);
                    const lungeEvaluation = evaluateLunge(frontKneeAngle, backKneeAngle);
                    console.log(`Lunge Evaluation: ${lungeEvaluation}, Front Knee Angle: ${frontKneeAngle.toFixed(2)}, Back Knee Angle: ${backKneeAngle.toFixed(2)}`);

                    ctx.font = "30px Arial";
                    ctx.fillStyle = "red";
                    ctx.fillText(`Lunge: ${lungeEvaluation}`, 10, 50);

                    const currentTime = Date.now();
                    if (lungeEvaluation === "Perfect" && currentTime - lastCountTime > 2000) {
                        count += 1;
                        lastCountTime = currentTime;
                    }
                }

                if (rightKnee && rightHip && rightAnkle && leftKnee && leftAnkle && leftHip) {
                    const frontKneeAngle = calculateAngle(rightHip.position, rightKnee.position, rightAnkle.position);
                    const backKneeAngle = calculateAngle(leftHip.position, leftKnee.position, leftAnkle.position);
                    const lungeEvaluation = evaluateLunge(frontKneeAngle, backKneeAngle);
                    console.log(`Lunge Evaluation: ${lungeEvaluation}, Front Knee Angle: ${frontKneeAngle.toFixed(2)}, Back Knee Angle: ${backKneeAngle.toFixed(2)}`);

                    ctx.font = "30px Arial";
                    ctx.fillStyle = "red";
                    ctx.fillText(`Lunge: ${lungeEvaluation}`, 10, 50);

                    const currentTime = Date.now();
                    if (lungeEvaluation === "Perfect" && currentTime - lastCountTime > 2000) {
                        count += 1;
                        lastCountTime = currentTime;
                    }
                }
            } else if (selectedExercise === 'shoulderPress') {
                const leftElbow = pose.keypoints.find(point => point.part === 'leftElbow' && point.score > 0.5);
                const leftShoulder = pose.keypoints.find(point => point.part === 'leftShoulder' && point.score > 0.5);
                const leftWrist = pose.keypoints.find(point => point.part === 'leftWrist' && point.score > 0.5);
                const rightElbow = pose.keypoints.find(point => point.part === 'rightElbow' && point.score > 0.5);
                const rightShoulder = pose.keypoints.find(point => point.part === 'rightShoulder' && point.score > 0.5);
                const rightWrist = pose.keypoints.find(point => point.part === 'rightWrist' && point.score > 0.5);

                if (leftElbow && leftShoulder && leftWrist) {
                    const leftElbowAngle = calculateAngle(leftShoulder.position, leftElbow.position, leftWrist.position);
                    const shoulderPressEvaluation = evaluateShoulderPress(leftElbowAngle);
                    console.log(`Shoulder Press Evaluation: ${shoulderPressEvaluation}, Left Elbow Angle: ${leftElbowAngle.toFixed(2)}`);

                    ctx.font = "30px Arial";
                    ctx.fillStyle = "red";
                    ctx.fillText(`Shoulder Press: ${shoulderPressEvaluation}`, 10, 50);

                    const currentTime = Date.now();
                    if (shoulderPressEvaluation === "Perfect" && currentTime - lastCountTime > 2000) {
                        count += 1;
                        lastCountTime = currentTime;
                    }
                }

                if (rightElbow && rightShoulder && rightWrist) {
                    const rightElbowAngle = calculateAngle(rightShoulder.position, rightElbow.position, rightWrist.position);
                    const shoulderPressEvaluation = evaluateShoulderPress(rightElbowAngle);
                    console.log(`Shoulder Press Evaluation: ${shoulderPressEvaluation}, Right Elbow Angle: ${rightElbowAngle.toFixed(2)}`);

                    ctx.font = "30px Arial";
                    ctx.fillStyle = "red";
                    ctx.fillText(`Shoulder Press: ${shoulderPressEvaluation}`, 10, 50);

                    const currentTime = Date.now();
                    if (shoulderPressEvaluation === "Perfect" && currentTime - lastCountTime > 2000) {
                        count += 1;
                        lastCountTime = currentTime;
                    }
                }
            } else if (selectedExercise === 'dumbbellCurl') {
                const leftElbow = pose.keypoints.find(point => point.part === 'leftElbow' && point.score > 0.5);
                const leftShoulder = pose.keypoints.find(point => point.part === 'leftShoulder' && point.score > 0.5);
                const leftWrist = pose.keypoints.find(point => point.part === 'leftWrist' && point.score > 0.5);
                const rightElbow = pose.keypoints.find(point => point.part === 'rightElbow' && point.score > 0.5);
                const rightShoulder = pose.keypoints.find(point => point.part === 'rightShoulder' && point.score > 0.5);
                const rightWrist = pose.keypoints.find(point => point.part === 'rightWrist' && point.score > 0.5);

                if (leftElbow && leftShoulder && leftWrist) {
                    const leftElbowAngle = calculateAngle(leftShoulder.position, leftElbow.position, leftWrist.position);
                    const dumbbellCurlEvaluation = evaluateDumbbellCurl(leftElbowAngle);
                    console.log(`Dumbbell Curl Evaluation: ${dumbbellCurlEvaluation}, Left Elbow Angle: ${leftElbowAngle.toFixed(2)}`);

                    ctx.font = "30px Arial";
                    ctx.fillStyle = "red";
                    ctx.fillText(`Dumbbell Curl: ${dumbbellCurlEvaluation}`, 10, 50);

                    const currentTime = Date.now();
                    if (dumbbellCurlEvaluation === "Perfect" && currentTime - lastCountTime > 2000) {
                        count += 1;
                        lastCountTime = currentTime;
                    }
                }

                if (rightElbow && rightShoulder && rightWrist) {
                    const rightElbowAngle = calculateAngle(rightShoulder.position, rightElbow.position, rightWrist.position);
                    const dumbbellCurlEvaluation = evaluateDumbbellCurl(rightElbowAngle);
                    console.log(`Dumbbell Curl Evaluation: ${dumbbellCurlEvaluation}, Right Elbow Angle: ${rightElbowAngle.toFixed(2)}`);

                    ctx.font = "30px Arial";
                    ctx.fillStyle = "red";
                    ctx.fillText(`Dumbbell Curl: ${dumbbellCurlEvaluation}`, 10, 50);

                    const currentTime = Date.now();
                    if (dumbbellCurlEvaluation === "Perfect" && currentTime - lastCountTime > 2000) {
                        count += 1;
                        lastCountTime = currentTime;
                    }
                }
            }

            countDisplay.innerText = `Count: ${count}`;
        }
        requestAnimationFrame(poseDetectionFrame);
    }
    poseDetectionFrame();
}

function drawKeypoints(keypoints, minConfidence, ctx) {
    keypoints.forEach(keypoint => {
        if (keypoint.score >= minConfidence) {
            const { y, x } = keypoint.position;
            ctx.beginPath();
            ctx.arc(x, y, 5, 0, 2 * Math.PI);
            ctx.fillStyle = 'aqua';
            ctx.fill();
        }
    });
}

function drawSkeleton(keypoints, minConfidence, ctx) {
    const adjacentKeyPoints = posenet.getAdjacentKeyPoints(keypoints, minConfidence);
    adjacentKeyPoints.forEach((keypoints) => {
        const [{ y: y1, x: x1 }, { y: y2, x: x2 }] = keypoints;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'aqua';
        ctx.stroke();
    });
}

async function main() {
    const video = await setupCamera();
    video.play();
    const net = await setupPoseNet(video);
    detectPose(video, net);
}

main();