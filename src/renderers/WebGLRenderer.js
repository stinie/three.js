/**
 * @author supereggbert / http://www.paulbrunt.co.uk/
 * @author mrdoob / http://mrdoob.com/
 * @author alteredq / http://alteredqualia.com/
 */

THREE.WebGLRenderer = function ( parameters ) {

	// Currently you can use just up to 4 directional / point lights total.
	// Chrome barfs on shader linking when there are more than 4 lights :(

	// The problem comes from shader using too many varying vectors.

	// This is not GPU limitation as the same shader works ok in Firefox
	// and Chrome with "--use-gl=desktop" flag.

	// Difference comes from Chrome on Windows using by default ANGLE,
	// thus going DirectX9 route (while FF uses OpenGL).

	// See http://code.google.com/p/chromium/issues/detail?id=63491

	var _canvas = document.createElement( 'canvas' ), _gl,
	_oldProgram, _uberProgram,
	_modelViewMatrix = new THREE.Matrix4(), _normalMatrix,

	_viewMatrixArray = new Float32Array(16),
	_modelViewMatrixArray = new Float32Array(16),
	_projectionMatrixArray = new Float32Array(16),
	_normalMatrixArray = new Float32Array(9),
	_objectMatrixArray = new Float32Array(16),

	// ubershader material constants

	BASIC = 0, LAMBERT = 1, PHONG = 2,

	// heuristics to create shader parameters according to lights in the scene
	// (not to blow over maxLights budget)

	maxLightCount = allocateLights( parameters.scene, 4 );
	fog = parameters.scene ? parameters.scene.fog : null,
	
	antialias = parameters.antialias != undefined ? parameters.antialias : true,
	
	clearColor = parameters.clearColor ? new THREE.Color( parameters.clearColor ) : new THREE.Color( 0x000000 ),
	clearAlpha = parameters.clearAlpha ? parameters.clearAlpha : 0;
	
	this.domElement = _canvas;
	this.autoClear = true;

	initGL( antialias, clearColor, clearAlpha );

	_uberProgram = initUbershader( maxLightCount.directional, maxLightCount.point, fog );
	_oldProgram = _uberProgram;

	//alert( dumpObject( getGLParams() ) );

	this.setSize = function ( width, height ) {

		_canvas.width = width;
		_canvas.height = height;
		_gl.viewport( 0, 0, _canvas.width, _canvas.height );

	};

	this.setClearColor = function( hex, alpha ) {
		
		var color = new THREE.Color( hex );
		_gl.clearColor( color.r, color.g, color.b, alpha );
		
	};
	
	this.clear = function () {

		_gl.clear( _gl.COLOR_BUFFER_BIT | _gl.DEPTH_BUFFER_BIT );

	};

	this.setupLights = function ( program, lights ) {

		var l, ll, light, r, g, b,
			ambientLights = [], pointLights = [], directionalLights = [],
			colors = [], positions = [];

		_gl.uniform1i( program.uniforms.enableLighting, lights.length );

		for ( l = 0, ll = lights.length; l < ll; l++ ) {

			light = lights[ l ];

			if ( light instanceof THREE.AmbientLight ) {

				ambientLights.push( light );

			} else if ( light instanceof THREE.DirectionalLight ) {

				directionalLights.push( light );

			} else if( light instanceof THREE.PointLight ) {

				pointLights.push( light );

			}

		}

		// sum all ambient lights
		r = g = b = 0.0;

		for ( l = 0, ll = ambientLights.length; l < ll; l++ ) {

			r += ambientLights[ l ].color.r;
			g += ambientLights[ l ].color.g;
			b += ambientLights[ l ].color.b;

		}

		_gl.uniform3f( program.uniforms.ambientLightColor, r, g, b );

		// pass directional lights as float arrays

		colors = []; positions = [];

		for ( l = 0, ll = directionalLights.length; l < ll; l++ ) {

			light = directionalLights[ l ];

			colors.push( light.color.r * light.intensity );
			colors.push( light.color.g * light.intensity );
			colors.push( light.color.b * light.intensity );

			positions.push( light.position.x );
			positions.push( light.position.y );
			positions.push( light.position.z );

		}

		if ( directionalLights.length ) {

			_gl.uniform1i(  program.uniforms.directionalLightNumber, directionalLights.length );
			_gl.uniform3fv( program.uniforms.directionalLightDirection, positions );
			_gl.uniform3fv( program.uniforms.directionalLightColor, colors );

		}

		// pass point lights as float arrays

		colors = []; positions = [];

		for ( l = 0, ll = pointLights.length; l < ll; l++ ) {

			light = pointLights[ l ];

			colors.push( light.color.r * light.intensity );
			colors.push( light.color.g * light.intensity );
			colors.push( light.color.b * light.intensity );

			positions.push( light.position.x );
			positions.push( light.position.y );
			positions.push( light.position.z );

		}

		if ( pointLights.length ) {

			_gl.uniform1i(  program.uniforms.pointLightNumber, pointLights.length );
			_gl.uniform3fv( program.uniforms.pointLightPosition, positions );
			_gl.uniform3fv( program.uniforms.pointLightColor, colors );

		}

	};

	this.createBuffers = function ( object, g ) {

		var f, fl, fi, face, vertexNormals, normal, uv, v1, v2, v3, v4, t1, t2, t3, t4, m, ml, i,

		faceArray = [],
		lineArray = [],

		vertexArray = [],
		normalArray = [],
		tangentArray = [],
		uvArray = [],

		vertexIndex = 0,

		geometryChunk = object.geometry.geometryChunks[ g ],

		needsSmoothNormals = bufferNeedsSmoothNormals ( geometryChunk, object );

		for ( f = 0, fl = geometryChunk.faces.length; f < fl; f++ ) {

			fi = geometryChunk.faces[ f ];

			face = object.geometry.faces[ fi ];
			vertexNormals = face.vertexNormals;
			faceNormal = face.normal;
			uv = object.geometry.uvs[ fi ];

			if ( face instanceof THREE.Face3 ) {

				v1 = object.geometry.vertices[ face.a ].position;
				v2 = object.geometry.vertices[ face.b ].position;
				v3 = object.geometry.vertices[ face.c ].position;

				vertexArray.push( v1.x, v1.y, v1.z );
				vertexArray.push( v2.x, v2.y, v2.z );
				vertexArray.push( v3.x, v3.y, v3.z );

				if ( object.geometry.hasTangents ) {

					t1 = object.geometry.vertices[ face.a ].tangent;
					t2 = object.geometry.vertices[ face.b ].tangent;
					t3 = object.geometry.vertices[ face.c ].tangent;

					tangentArray.push( t1.x, t1.y, t1.z, t1.w );
					tangentArray.push( t2.x, t2.y, t2.z, t2.w );
					tangentArray.push( t3.x, t3.y, t3.z, t3.w );

				}

				if ( vertexNormals.length == 3 && needsSmoothNormals ) {


					for ( i = 0; i < 3; i ++ ) {

						normalArray.push( vertexNormals[ i ].x, vertexNormals[ i ].y, vertexNormals[ i ].z );

					}

				} else {

					for ( i = 0; i < 3; i ++ ) {

						normalArray.push( faceNormal.x, faceNormal.y, faceNormal.z );

					}

				}

				if ( uv ) {

					for ( i = 0; i < 3; i ++ ) {

						uvArray.push( uv[ i ].u, uv[ i ].v );

					}

				}

				faceArray.push( vertexIndex, vertexIndex + 1, vertexIndex + 2 );

				// TODO: don't add lines that already exist (faces sharing edge)

				lineArray.push( vertexIndex, vertexIndex + 1 );
				lineArray.push( vertexIndex, vertexIndex + 2 );
				lineArray.push( vertexIndex + 1, vertexIndex + 2 );

				vertexIndex += 3;

			} else if ( face instanceof THREE.Face4 ) {

				v1 = object.geometry.vertices[ face.a ].position;
				v2 = object.geometry.vertices[ face.b ].position;
				v3 = object.geometry.vertices[ face.c ].position;
				v4 = object.geometry.vertices[ face.d ].position;

				vertexArray.push( v1.x, v1.y, v1.z );
				vertexArray.push( v2.x, v2.y, v2.z );
				vertexArray.push( v3.x, v3.y, v3.z );
				vertexArray.push( v4.x, v4.y, v4.z );

				if ( object.geometry.hasTangents ) {

					t1 = object.geometry.vertices[ face.a ].tangent;
					t2 = object.geometry.vertices[ face.b ].tangent;
					t3 = object.geometry.vertices[ face.c ].tangent;
					t4 = object.geometry.vertices[ face.d ].tangent;

					tangentArray.push( t1.x, t1.y, t1.z, t1.w );
					tangentArray.push( t2.x, t2.y, t2.z, t2.w );
					tangentArray.push( t3.x, t3.y, t3.z, t3.w );
					tangentArray.push( t4.x, t4.y, t4.z, t4.w );

				}

				if ( vertexNormals.length == 4 && needsSmoothNormals ) {

					for ( i = 0; i < 4; i ++ ) {

						normalArray.push( vertexNormals[ i ].x, vertexNormals[ i ].y, vertexNormals[ i ].z );

					}

				} else {

					for ( i = 0; i < 4; i ++ ) {

						normalArray.push( faceNormal.x, faceNormal.y, faceNormal.z );

					}

				}

				if ( uv ) {

					for ( i = 0; i < 4; i ++ ) {

						uvArray.push( uv[ i ].u, uv[ i ].v );

					}

				}

				faceArray.push( vertexIndex, vertexIndex + 1, vertexIndex + 2 );
				faceArray.push( vertexIndex, vertexIndex + 2, vertexIndex + 3 );

				// TODO: don't add lines that already exist (faces sharing edge)

				lineArray.push( vertexIndex, vertexIndex + 1 );
				lineArray.push( vertexIndex, vertexIndex + 2 );
				lineArray.push( vertexIndex, vertexIndex + 3 );
				lineArray.push( vertexIndex + 1, vertexIndex + 2 );
				lineArray.push( vertexIndex + 2, vertexIndex + 3 );

				vertexIndex += 4;

			}

		}

		if ( !vertexArray.length ) {

			return;

		}

		geometryChunk.__webGLVertexBuffer = _gl.createBuffer();
		_gl.bindBuffer( _gl.ARRAY_BUFFER, geometryChunk.__webGLVertexBuffer );
		_gl.bufferData( _gl.ARRAY_BUFFER, new Float32Array( vertexArray ), _gl.STATIC_DRAW );

		geometryChunk.__webGLNormalBuffer = _gl.createBuffer();
		_gl.bindBuffer( _gl.ARRAY_BUFFER, geometryChunk.__webGLNormalBuffer );
		_gl.bufferData( _gl.ARRAY_BUFFER, new Float32Array( normalArray ), _gl.STATIC_DRAW );

		if ( object.geometry.hasTangents ) {

			geometryChunk.__webGLTangentBuffer = _gl.createBuffer();
			_gl.bindBuffer( _gl.ARRAY_BUFFER, geometryChunk.__webGLTangentBuffer );
			_gl.bufferData( _gl.ARRAY_BUFFER, new Float32Array( tangentArray ), _gl.STATIC_DRAW );

		}

		if ( uvArray.length > 0 ) {

			geometryChunk.__webGLUVBuffer = _gl.createBuffer();
			_gl.bindBuffer( _gl.ARRAY_BUFFER, geometryChunk.__webGLUVBuffer );
			_gl.bufferData( _gl.ARRAY_BUFFER, new Float32Array( uvArray ), _gl.STATIC_DRAW );

		}

		geometryChunk.__webGLFaceBuffer = _gl.createBuffer();
		_gl.bindBuffer( _gl.ELEMENT_ARRAY_BUFFER, geometryChunk.__webGLFaceBuffer );
		_gl.bufferData( _gl.ELEMENT_ARRAY_BUFFER, new Uint16Array( faceArray ), _gl.STATIC_DRAW );

		geometryChunk.__webGLLineBuffer = _gl.createBuffer();
		_gl.bindBuffer( _gl.ELEMENT_ARRAY_BUFFER, geometryChunk.__webGLLineBuffer );
		_gl.bufferData( _gl.ELEMENT_ARRAY_BUFFER, new Uint16Array( lineArray ), _gl.STATIC_DRAW );

		geometryChunk.__webGLFaceCount = faceArray.length;
		geometryChunk.__webGLLineCount = lineArray.length;

	};

	function cloneUniforms( uniforms_src ) {
		
		var u, p, parameter, uniforms_dst = {};
		
		for ( u in uniforms_src ) {
			
			uniforms_dst[ u ] = {};
			
			for ( p in uniforms[ u ] ) {
				
				parameter_src = uniforms_src[ u ][ p ];
				parameter_dst = uniforms_dst[ u ][ p ];
				
				if ( parameter_src instanceof THREE.Color ||
					 parameter_src instanceof THREE.Vector3 ||
					 parameter_src instanceof THREE.Texture ) {
				
					parameter_dst = parameter_src.clone();
					
				} else {
					
					parameter_dst = parameter_src;
					
				}				
				
			}
			
		}
		
		return uniforms_dst;
		
	};
	
	function setMaterialShaders( material, shaders ) {

		material.fragment_shader = shaders.fragment_shader;
		material.vertex_shader = shaders.vertex_shader;
		material.uniforms = cloneUniforms( shaders.uniforms );

	};

	this.renderBuffer = function ( camera, lights, fog, material, geometryChunk ) {

		var mColor, mOpacity, mReflectivity,
			mWireframe, mLineWidth, mBlending,
			mAmbient, mSpecular, mShininess,
			mMap, envMap, mixEnvMap,
			mRefractionRatio, useRefract,
			program, u, identifiers, attributes;


		if ( material instanceof THREE.MeshShaderMaterial ||
			 material instanceof THREE.MeshDepthMaterial ||
			 material instanceof THREE.MeshNormalMaterial ) {

			if ( !material.program ) {

				if ( material instanceof THREE.MeshDepthMaterial ) {

					setMaterialShaders( material, ShaderLib[ 'depth' ] );

					material.uniforms.mNear.value = camera.near;
					material.uniforms.mFar.value = camera.far;

				} else if ( material instanceof THREE.MeshNormalMaterial ) {

					setMaterialShaders( material, ShaderLib[ 'normal' ] );

				}

				material.program = buildProgram( material.fragment_shader, material.vertex_shader, null );

				identifiers = [ 'viewMatrix', 'modelViewMatrix', 'projectionMatrix', 'normalMatrix', 'objectMatrix', 'cameraPosition' ];
				for( u in material.uniforms ) {

					identifiers.push(u);

				}

				cacheUniformLocations( material.program, identifiers );
				cacheAttributeLocations( material.program, [ "position", "normal", "uv", "tangent" ] );

			}

			program = material.program;

		} else {

			program = _uberProgram;

		}

		if( program != _oldProgram ) {

			_gl.useProgram( program );
			_oldProgram = program;

		}

		if ( program == _uberProgram ) {

			this.setupLights( program, lights );

		}

		this.loadCamera( program, camera );
		this.loadMatrices( program );

		if ( material instanceof THREE.MeshShaderMaterial ||
		     material instanceof THREE.MeshDepthMaterial ||
			 material instanceof THREE.MeshNormalMaterial ) {

			mWireframe = material.wireframe;
			mLineWidth = material.wireframe_linewidth;

			mBlending = material.blending;

			setUniforms( program, material.uniforms );

		}

		if ( material instanceof THREE.MeshPhongMaterial ||
			 material instanceof THREE.MeshLambertMaterial ||
			 material instanceof THREE.MeshBasicMaterial ) {

			mColor = material.color;
			mOpacity = material.opacity;

			mWireframe = material.wireframe;
			mLineWidth = material.wireframe_linewidth;

			mBlending = material.blending;

			mMap = material.map;
			envMap = material.env_map;

			mixEnvMap = material.combine == THREE.MixOperation;
			mReflectivity = material.reflectivity;

			useRefract = material.env_map && material.env_map.mapping instanceof THREE.CubeRefractionMapping;
			mRefractionRatio = material.refraction_ratio;

			_gl.uniform4f( program.uniforms.mColor,  mColor.r * mOpacity, mColor.g * mOpacity, mColor.b * mOpacity, mOpacity );

			_gl.uniform1i( program.uniforms.mixEnvMap, mixEnvMap );
			_gl.uniform1f( program.uniforms.mReflectivity, mReflectivity );

			_gl.uniform1i( program.uniforms.useRefract, useRefract );
			_gl.uniform1f( program.uniforms.mRefractionRatio, mRefractionRatio );

			if ( fog ) {

				_gl.uniform3f( program.uniforms.fogColor, fog.color.r, fog.color.g, fog.color.b );
				
				if ( fog instanceof THREE.Fog ) {
				
					_gl.uniform1f( program.uniforms.fogNear, fog.near );
					_gl.uniform1f( program.uniforms.fogFar, fog.far );
					
				} else if ( fog instanceof THREE.FogExp2 ) {
					
					_gl.uniform1f( program.uniforms.fogDensity, fog.density );
					
				}

			}

		}

		if ( material instanceof THREE.MeshPhongMaterial ) {

			mAmbient  = material.ambient;
			mSpecular = material.specular;
			mShininess = material.shininess;

			_gl.uniform4f( program.uniforms.mAmbient,  mAmbient.r,  mAmbient.g,  mAmbient.b,  mOpacity );
			_gl.uniform4f( program.uniforms.mSpecular, mSpecular.r, mSpecular.g, mSpecular.b, mOpacity );
			_gl.uniform1f( program.uniforms.mShininess, mShininess );

			_gl.uniform1i( program.uniforms.material, PHONG );

		} else if ( material instanceof THREE.MeshLambertMaterial ) {

			_gl.uniform1i( program.uniforms.material, LAMBERT );

		} else if ( material instanceof THREE.MeshBasicMaterial ) {

			_gl.uniform1i( program.uniforms.material, BASIC );

		}

		if ( mMap ) {

			setTexture( mMap, 0 );

			_gl.uniform1i( program.uniforms.tMap,  0 );
			_gl.uniform1i( program.uniforms.enableMap, 1 );

		} else {

			_gl.uniform1i( program.uniforms.enableMap, 0 );

		}

		if ( envMap ) {

			setCubeTexture( envMap, 1 );

			_gl.uniform1i( program.uniforms.tCube, 1 );
			_gl.uniform1i( program.uniforms.enableCubeMap, 1 );

		} else {

			_gl.uniform1i( program.uniforms.enableCubeMap, 0 );

		}

		attributes = program.attributes;

		// vertices

		_gl.bindBuffer( _gl.ARRAY_BUFFER, geometryChunk.__webGLVertexBuffer );
		_gl.vertexAttribPointer( attributes.position, 3, _gl.FLOAT, false, 0, 0 );
		_gl.enableVertexAttribArray( attributes.position );

		// normals

		if ( attributes.normal >= 0 ) {

			_gl.bindBuffer( _gl.ARRAY_BUFFER, geometryChunk.__webGLNormalBuffer );
			_gl.vertexAttribPointer( attributes.normal, 3, _gl.FLOAT, false, 0, 0 );
			_gl.enableVertexAttribArray( attributes.normal );

		}

		// tangents

		if ( attributes.tangent >= 0 ) {

			_gl.bindBuffer( _gl.ARRAY_BUFFER, geometryChunk.__webGLTangentBuffer );
			_gl.vertexAttribPointer( attributes.tangent, 4, _gl.FLOAT, false, 0, 0 );
			_gl.enableVertexAttribArray( attributes.tangent );

		}

		// uvs

		if ( attributes.uv >= 0 ) {

			if ( geometryChunk.__webGLUVBuffer ) {

				_gl.bindBuffer( _gl.ARRAY_BUFFER, geometryChunk.__webGLUVBuffer );
				_gl.vertexAttribPointer( attributes.uv, 2, _gl.FLOAT, false, 0, 0 );

				_gl.enableVertexAttribArray( attributes.uv );

			} else {

				_gl.disableVertexAttribArray( attributes.uv );

			}

		}

		// render triangles

		if ( ! mWireframe ) {

			_gl.bindBuffer( _gl.ELEMENT_ARRAY_BUFFER, geometryChunk.__webGLFaceBuffer );
			_gl.drawElements( _gl.TRIANGLES, geometryChunk.__webGLFaceCount, _gl.UNSIGNED_SHORT, 0 );

		// render lines

		} else {

			_gl.lineWidth( mLineWidth );
			_gl.bindBuffer( _gl.ELEMENT_ARRAY_BUFFER, geometryChunk.__webGLLineBuffer );
			_gl.drawElements( _gl.LINES, geometryChunk.__webGLLineCount, _gl.UNSIGNED_SHORT, 0 );

		}

	};

	this.renderPass = function ( camera, lights, fog, object, geometryChunk, blending, transparent ) {

		var i, l, m, ml, material, meshMaterial;

		for ( m = 0, ml = object.materials.length; m < ml; m++ ) {

			meshMaterial = object.materials[ m ];

			if ( meshMaterial instanceof THREE.MeshFaceMaterial ) {

				for ( i = 0, l = geometryChunk.materials.length; i < l; i++ ) {

					material = geometryChunk.materials[ i ];

					if ( material && material.blending == blending && ( material.opacity < 1.0 == transparent ) ) {

						this.setBlending( material.blending );
						this.renderBuffer( camera, lights, fog, material, geometryChunk );

					}

				}

			} else {

				material = meshMaterial;
				if ( material && material.blending == blending && ( material.opacity < 1.0 == transparent ) ) {

					this.setBlending( material.blending );
					this.renderBuffer( camera, lights, fog, material, geometryChunk );

				}

			}

		}

	};

	this.render = function( scene, camera ) {

		var o, ol, webGLObject, object, buffer,
			lights = scene.lights,
			fog = scene.fog;

		this.initWebGLObjects( scene );

		if ( this.autoClear ) {

			this.clear();

		}

		camera.autoUpdateMatrix && camera.updateMatrix();

		_viewMatrixArray.set( camera.matrix.flatten() );
		_projectionMatrixArray.set( camera.projectionMatrix.flatten() );

		// opaque pass

		for ( o = 0, ol = scene.__webGLObjects.length; o < ol; o++ ) {

			webGLObject = scene.__webGLObjects[ o ];

			object = webGLObject.object;
			buffer = webGLObject.buffer;

			if ( object.visible ) {

				this.setupMatrices( object, camera );
				this.renderPass( camera, lights, fog, object, buffer, THREE.NormalBlending, false );

			}

		}

		// transparent pass

		for ( o = 0, ol = scene.__webGLObjects.length; o < ol; o++ ) {

			webGLObject = scene.__webGLObjects[ o ];

			object = webGLObject.object;
			buffer = webGLObject.buffer;

			if ( object.visible ) {

				this.setupMatrices( object, camera );

				// opaque blended materials

				this.renderPass( camera, lights, fog, object, buffer, THREE.AdditiveBlending, false );
				this.renderPass( camera, lights, fog, object, buffer, THREE.SubtractiveBlending, false );

				// transparent blended materials

				this.renderPass( camera, lights, fog, object, buffer, THREE.AdditiveBlending, true );
				this.renderPass( camera, lights, fog, object, buffer, THREE.SubtractiveBlending, true );

				// transparent normal materials

				this.renderPass( camera, lights, fog, object, buffer, THREE.NormalBlending, true );

			}

		}

	};

	this.initWebGLObjects = function( scene ) {

		var o, ol, object, globject, g, geometryChunk, objmap;

		if ( !scene.__webGLObjects ) {

			scene.__webGLObjects = [];
			scene.__webGLObjectsMap = {};

		}

		for ( o = 0, ol = scene.objects.length; o < ol; o++ ) {

			object = scene.objects[ o ];

			if ( scene.__webGLObjectsMap[ object.id ] == undefined ) {

				scene.__webGLObjectsMap[ object.id ] = {};

			}

			objmap = scene.__webGLObjectsMap[ object.id ];

			if ( object instanceof THREE.Mesh ) {

				// create separate VBOs per geometry chunk

				for ( g in object.geometry.geometryChunks ) {

					geometryChunk = object.geometry.geometryChunks[ g ];

					// initialise VBO on the first access

					if( ! geometryChunk.__webGLVertexBuffer ) {

						this.createBuffers( object, g );

					}

					// create separate wrapper per each use of VBO

					if ( objmap[ g ] == undefined ) {

						globject = { buffer: geometryChunk, object: object };
						scene.__webGLObjects.push( globject );

						objmap[ g ] = 1;

					}

				}

			}/* else if ( object instanceof THREE.Line ) {

			} else if ( object instanceof THREE.Particle ) {

			}*/

		}

	};

	this.removeObject = function ( scene, object ) {

		var o, ol, zobject;

		for ( o = scene.__webGLObjects.length - 1; o >= 0; o-- ) {

			zobject = scene.__webGLObjects[ o ].object;

			if ( object == zobject ) {

				scene.__webGLObjects.splice( o, 1 );

			}

		}

	};

	this.setupMatrices = function ( object, camera ) {

		object.autoUpdateMatrix && object.updateMatrix();

		_modelViewMatrix.multiply( camera.matrix, object.matrix );
		_modelViewMatrixArray.set( _modelViewMatrix.flatten() );

		_normalMatrix = THREE.Matrix4.makeInvert3x3( _modelViewMatrix ).transpose();
		_normalMatrixArray.set( _normalMatrix.m );

		_objectMatrixArray.set( object.matrix.flatten() );

	};

	this.loadMatrices = function ( program ) {

		_gl.uniformMatrix4fv( program.uniforms.viewMatrix, false, _viewMatrixArray );
		_gl.uniformMatrix4fv( program.uniforms.modelViewMatrix, false, _modelViewMatrixArray );
		_gl.uniformMatrix4fv( program.uniforms.projectionMatrix, false, _projectionMatrixArray );
		_gl.uniformMatrix3fv( program.uniforms.normalMatrix, false, _normalMatrixArray );
		_gl.uniformMatrix4fv( program.uniforms.objectMatrix, false, _objectMatrixArray );

	};

	this.loadCamera = function( program, camera ) {

		_gl.uniform3f( program.uniforms.cameraPosition, camera.position.x, camera.position.y, camera.position.z );

	};

	this.setBlending = function( blending ) {

		switch ( blending ) {

			case THREE.AdditiveBlending:

				_gl.blendEquation( _gl.FUNC_ADD );
				_gl.blendFunc( _gl.ONE, _gl.ONE );

				break;

			case THREE.SubtractiveBlending:

				//_gl.blendEquation( _gl.FUNC_SUBTRACT );
				_gl.blendFunc( _gl.DST_COLOR, _gl.ZERO );

				break;

			default:

				_gl.blendEquation( _gl.FUNC_ADD );
				_gl.blendFunc( _gl.ONE, _gl.ONE_MINUS_SRC_ALPHA );

				break;
		}

	};

	this.setFaceCulling = function ( cullFace, frontFace ) {

		if ( cullFace ) {

			if ( !frontFace || frontFace == "ccw" ) {

				_gl.frontFace( _gl.CCW );

			} else {

				_gl.frontFace( _gl.CW );

			}

			if( cullFace == "back" ) {

				_gl.cullFace( _gl.BACK );

			} else if( cullFace == "front" ) {

				_gl.cullFace( _gl.FRONT );

			} else {

				_gl.cullFace( _gl.FRONT_AND_BACK );

			}

			_gl.enable( _gl.CULL_FACE );

		} else {

			_gl.disable( _gl.CULL_FACE );

		}

	};

	this.supportsVertexTextures = function() {

		return maxVertexTextures() > 0;

	};

	function maxVertexTextures() {

		return _gl.getParameter( _gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS );

	};


	function initGL( antialias, clearColor, clearAlpha ) {

		try {

			_gl = _canvas.getContext( 'experimental-webgl', { antialias: antialias } );

		} catch(e) { }

		if (!_gl) {

			alert("WebGL not supported");
			throw "cannot create webgl context";

		}

		_gl.clearColor( 0, 0, 0, 1 );
		_gl.clearDepth( 1 );

		_gl.enable( _gl.DEPTH_TEST );
		_gl.depthFunc( _gl.LEQUAL );

		_gl.frontFace( _gl.CCW );
		_gl.cullFace( _gl.BACK );
		_gl.enable( _gl.CULL_FACE );

		_gl.enable( _gl.BLEND );
		_gl.blendFunc( _gl.ONE, _gl.ONE_MINUS_SRC_ALPHA );
		_gl.clearColor( clearColor.r, clearColor.g, clearColor.b, clearAlpha );

	};

	function generateFragmentShader( maxDirLights, maxPointLights ) {

		var chunks = [

			maxDirLights   ? "#define MAX_DIR_LIGHTS " + maxDirLights     : "",
			maxPointLights ? "#define MAX_POINT_LIGHTS " + maxPointLights : "",

			"uniform int material;", // 0 - Basic, 1 - Lambert, 2 - Phong

			"uniform bool enableMap;",
			"uniform bool enableCubeMap;",
			"uniform bool mixEnvMap;",

			"uniform samplerCube tCube;",
			"uniform float mReflectivity;",

			"uniform sampler2D tMap;",
			"uniform vec4 mColor;",
			"uniform float mOpacity;",

			"uniform vec4 mAmbient;",
			"uniform vec4 mSpecular;",
			"uniform float mShininess;",

			"#ifdef USE_FOG",
				"uniform vec3 fogColor;",
				
				"#ifdef FOG_EXP2",
					"uniform float fogDensity;",
				"#else",
					"uniform float fogNear;",
					"uniform float fogFar;",
				"#endif",
				
			"#endif",

			"uniform int pointLightNumber;",
			"uniform int directionalLightNumber;",

			maxDirLights ? "uniform vec3 directionalLightDirection[ MAX_DIR_LIGHTS ];" : "",

			"varying vec3 vNormal;",
			"varying vec2 vUv;",

			"varying vec3 vLightWeighting;",

			maxPointLights ? "varying vec3 vPointLightVector[ MAX_POINT_LIGHTS ];"     : "",

			"varying vec3 vViewPosition;",

			"varying vec3 vReflect;",

			"void main() {",

				"vec4 mapColor = vec4( 1.0, 1.0, 1.0, 1.0 );",
				"vec4 cubeColor = vec4( 1.0, 1.0, 1.0, 1.0 );",

				// diffuse map

				"if ( enableMap ) {",

					"mapColor = texture2D( tMap, vUv );",

				"}",

				// cube map

				"if ( enableCubeMap ) {",

					"cubeColor = textureCube( tCube, vec3( -vReflect.x, vReflect.yz ) );",
					// "cubeColor.r = textureCube( tCube, vec3( -vReflect.x, vReflect.yz ) ).r;",
					// "cubeColor.g = textureCube( tCube, vec3( -vReflect.x + 0.005, vReflect.yz ) ).g;",
					// "cubeColor.b = textureCube( tCube, vec3( -vReflect.x + 0.01, vReflect.yz ) ).b;",

				"}",

				// Blinn-Phong
				// based on o3d example

				"if ( material == 2 ) { ",

					"vec3 normal = normalize( vNormal );",
					"vec3 viewPosition = normalize( vViewPosition );",

					// point lights

					maxPointLights ? "vec4 pointDiffuse  = vec4( 0.0, 0.0, 0.0, 0.0 );" : "",
					maxPointLights ? "vec4 pointSpecular = vec4( 0.0, 0.0, 0.0, 0.0 );" : "",

					maxPointLights ? "for( int i = 0; i < MAX_POINT_LIGHTS; i++ ) {" : "",

					maxPointLights ? 	"vec3 pointVector = normalize( vPointLightVector[ i ] );" : "",
					maxPointLights ? 	"vec3 pointHalfVector = normalize( vPointLightVector[ i ] + vViewPosition );" : "",

					maxPointLights ? 	"float pointDotNormalHalf = dot( normal, pointHalfVector );" : "",
					maxPointLights ? 	"float pointDiffuseWeight = max( dot( normal, pointVector ), 0.0 );" : "",

					// Ternary conditional is from the original o3d shader. Here it produces abrupt dark cutoff artefacts.
					// Using just pow works ok in Chrome, but makes different artefact in Firefox 4.
					// Zeroing on negative pointDotNormalHalf seems to work in both.

					//"float specularCompPoint = dot( normal, pointVector ) < 0.0 || pointDotNormalHalf < 0.0 ? 0.0 : pow( pointDotNormalHalf, mShininess );",
					//"float specularCompPoint = pow( pointDotNormalHalf, mShininess );",
					//"float pointSpecularWeight = pointDotNormalHalf < 0.0 ? 0.0 : pow( pointDotNormalHalf, mShininess );",

					// Ternary conditional inside for loop breaks Chrome shader linking.
					// Must do it with if.

					maxPointLights ? 	"float pointSpecularWeight = 0.0;" : "",
					maxPointLights ? 	"if ( pointDotNormalHalf >= 0.0 )" : "",
					maxPointLights ? 		"pointSpecularWeight = pow( pointDotNormalHalf, mShininess );" : "",

					maxPointLights ? 	"pointDiffuse  += mColor * pointDiffuseWeight;" : "",
					maxPointLights ? 	"pointSpecular += mSpecular * pointSpecularWeight;" : "",

					maxPointLights ? "}" : "",

					// directional lights

					maxDirLights ? "vec4 dirDiffuse  = vec4( 0.0, 0.0, 0.0, 0.0 );" : "",
					maxDirLights ? "vec4 dirSpecular = vec4( 0.0, 0.0, 0.0, 0.0 );" : "",

					maxDirLights ? "for( int i = 0; i < MAX_DIR_LIGHTS; i++ ) {" : "",

					maxDirLights ?		"vec4 lDirection = viewMatrix * vec4( directionalLightDirection[ i ], 0.0 );" : "",

					maxDirLights ? 		"vec3 dirVector = normalize( lDirection.xyz );" : "",
					maxDirLights ? 		"vec3 dirHalfVector = normalize( lDirection.xyz + vViewPosition );" : "",

					maxDirLights ? 		"float dirDotNormalHalf = dot( normal, dirHalfVector );" : "",

					maxDirLights ? 		"float dirDiffuseWeight = max( dot( normal, dirVector ), 0.0 );" : "",

					maxDirLights ? 		"float dirSpecularWeight = 0.0;" : "",
					maxDirLights ? 		"if ( dirDotNormalHalf >= 0.0 )" : "",
					maxDirLights ? 			"dirSpecularWeight = pow( dirDotNormalHalf, mShininess );" : "",

					maxDirLights ? 		"dirDiffuse  += mColor * dirDiffuseWeight;" : "",
					maxDirLights ? 		"dirSpecular += mSpecular * dirSpecularWeight;" : "",

					maxDirLights ? "}" : "",

					// all lights contribution summation

					"vec4 totalLight = mAmbient;",
					maxDirLights   ? "totalLight += dirDiffuse + dirSpecular;" : "",
					maxPointLights ? "totalLight += pointDiffuse + pointSpecular;" : "",

					// looks nicer with weighting

					"if ( mixEnvMap ) {",

						"gl_FragColor = vec4( mix( mapColor.rgb * totalLight.xyz * vLightWeighting, cubeColor.rgb, mReflectivity ), mapColor.a );",

					"} else {",

						"gl_FragColor = vec4( mapColor.rgb * cubeColor.rgb * totalLight.xyz * vLightWeighting, mapColor.a );",

					"}",

				// Lambert: diffuse lighting

				"} else if ( material == 1 ) {",

					"if ( mixEnvMap ) {",

						"gl_FragColor = vec4( mix( mColor.rgb * mapColor.rgb * vLightWeighting, cubeColor.rgb, mReflectivity ), mColor.a * mapColor.a );",

					"} else {",

						"gl_FragColor = vec4( mColor.rgb * mapColor.rgb * cubeColor.rgb * vLightWeighting, mColor.a * mapColor.a );",

					"}",

				// Basic: unlit color / texture

				"} else {",

					"if ( mixEnvMap ) {",

						"gl_FragColor = mix( mColor * mapColor, cubeColor, mReflectivity );",

					"} else {",

						"gl_FragColor = mColor * mapColor * cubeColor;",

					"}",

				"}",

				"#ifdef USE_FOG",
				
					"float depth = gl_FragCoord.z / gl_FragCoord.w;",

					"#ifdef FOG_EXP2",
						"const float LOG2 = 1.442695;",
						"float fogFactor = exp2( - fogDensity * fogDensity * depth * depth * LOG2 );",
						"fogFactor = 1.0 - clamp( fogFactor, 0.0, 1.0 );",
					"#else",
						"float fogFactor = smoothstep( fogNear, fogFar, depth );",
					"#endif",
					
					"gl_FragColor = mix( gl_FragColor, vec4( fogColor, 1.0 ), fogFactor );",

				"#endif",

			"}" ];

		return chunks.join("\n");

	};

	function generateVertexShader( maxDirLights, maxPointLights ) {

		var chunks = [

			maxDirLights   ? "#define MAX_DIR_LIGHTS " + maxDirLights     : "",
			maxPointLights ? "#define MAX_POINT_LIGHTS " + maxPointLights : "",

			"uniform bool enableLighting;",
			"uniform bool useRefract;",

			"uniform int pointLightNumber;",
			"uniform int directionalLightNumber;",

			"uniform vec3 ambientLightColor;",

			maxDirLights ? "uniform vec3 directionalLightColor[ MAX_DIR_LIGHTS ];"     : "",
			maxDirLights ? "uniform vec3 directionalLightDirection[ MAX_DIR_LIGHTS ];" : "",

			maxPointLights ? "uniform vec3 pointLightColor[ MAX_POINT_LIGHTS ];"    : "",
			maxPointLights ? "uniform vec3 pointLightPosition[ MAX_POINT_LIGHTS ];" : "",

			"varying vec3 vNormal;",
			"varying vec2 vUv;",

			"varying vec3 vLightWeighting;",

			maxPointLights ? "varying vec3 vPointLightVector[ MAX_POINT_LIGHTS ];"     : "",

			"varying vec3 vViewPosition;",

			"varying vec3 vReflect;",
			"uniform float mRefractionRatio;",

			"void main(void) {",

				// world space

				"vec4 mPosition = objectMatrix * vec4( position, 1.0 );",
				"vViewPosition = cameraPosition - mPosition.xyz;",

				// this doesn't work on Mac
				//"vec3 nWorld = mat3(objectMatrix) * normal;",
				"vec3 nWorld = mat3( objectMatrix[0].xyz, objectMatrix[1].xyz, objectMatrix[2].xyz ) * normal;",

				// eye space

				"vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );",
				"vec3 transformedNormal = normalize( normalMatrix * normal );",

				"if ( !enableLighting ) {",

					"vLightWeighting = vec3( 1.0, 1.0, 1.0 );",

				"} else {",

					"vLightWeighting = ambientLightColor;",

					// directional lights

					maxDirLights ? "for( int i = 0; i < MAX_DIR_LIGHTS; i++ ) {" : "",
					maxDirLights ?		"vec4 lDirection = viewMatrix * vec4( directionalLightDirection[ i ], 0.0 );" : "",
					maxDirLights ?		"float directionalLightWeighting = max( dot( transformedNormal, normalize( lDirection.xyz ) ), 0.0 );" : "",
					maxDirLights ?		"vLightWeighting += directionalLightColor[ i ] * directionalLightWeighting;" : "",
					maxDirLights ? "}" : "",

					// point lights

					maxPointLights ? "for( int i = 0; i < MAX_POINT_LIGHTS; i++ ) {" : "",
					maxPointLights ? 	"vec4 lPosition = viewMatrix * vec4( pointLightPosition[ i ], 1.0 );" : "",
					maxPointLights ? 	"vPointLightVector[ i ] = normalize( lPosition.xyz - mvPosition.xyz );" : "",
					maxPointLights ? 	"float pointLightWeighting = max( dot( transformedNormal, vPointLightVector[ i ] ), 0.0 );" : "",
					maxPointLights ? 	"vLightWeighting += pointLightColor[ i ] * pointLightWeighting;" : "",
					maxPointLights ? "}" : "",

				"}",

				"vNormal = transformedNormal;",
				"vUv = uv;",

				"if ( useRefract ) {",

					"vReflect = refract( normalize(mPosition.xyz - cameraPosition), normalize(nWorld.xyz), mRefractionRatio );",

				"} else {",

					"vReflect = reflect( normalize(mPosition.xyz - cameraPosition), normalize(nWorld.xyz) );",

				"}",

				"gl_Position = projectionMatrix * mvPosition;",

			"}" ];

		return chunks.join("\n");

	};

	function buildProgram( fragment_shader, vertex_shader, fog ) {

		var program = _gl.createProgram(),

		prefix_fragment = [
			"#ifdef GL_ES",
			"precision highp float;",
			"#endif",

			fog ? "#define USE_FOG" : "",
			fog instanceof THREE.FogExp2 ? "#define FOG_EXP2" : "",

			"uniform mat4 viewMatrix;",
			"uniform vec3 cameraPosition;",
			""
		].join("\n"),

		prefix_vertex = [
			maxVertexTextures() > 0 ? "#define VERTEX_TEXTURES" : "",

			"uniform mat4 objectMatrix;",
			"uniform mat4 modelViewMatrix;",
			"uniform mat4 projectionMatrix;",
			"uniform mat4 viewMatrix;",
			"uniform mat3 normalMatrix;",
			"uniform vec3 cameraPosition;",
			"attribute vec3 position;",
			"attribute vec3 normal;",
			"attribute vec2 uv;",
			""
		].join("\n");

		_gl.attachShader( program, getShader( "fragment", prefix_fragment + fragment_shader ) );
		_gl.attachShader( program, getShader( "vertex", prefix_vertex + vertex_shader ) );

		_gl.linkProgram( program );

		if ( !_gl.getProgramParameter( program, _gl.LINK_STATUS ) ) {

			alert( "Could not initialise shaders\n"+
					"VALIDATE_STATUS: " + _gl.getProgramParameter( program, _gl.VALIDATE_STATUS ) + ", gl error [" + _gl.getError() + "]" );

		}

		program.uniforms = {};
		program.attributes = {};

		return program;

	};

	function setUniforms( program, uniforms ) {

		var u, value, type, location, texture;

		for( u in uniforms ) {

			type = uniforms[u].type;
			value = uniforms[u].value;
			location = program.uniforms[u];

			if( type == "i" ) {

				_gl.uniform1i( location, value );

			} else if( type == "f" ) {

				_gl.uniform1f( location, value );

			} else if( type == "v3" ) {

				_gl.uniform3f( location, value.x, value.y, value.z );

			} else if( type == "c" ) {

				_gl.uniform3f( location, value.r, value.g, value.b );

			} else if( type == "t" ) {

				_gl.uniform1i( location, value );

				texture = uniforms[u].texture;

				if ( !texture ) continue;

				if ( texture.image instanceof Array && texture.image.length == 6 ) {

					setCubeTexture( texture, value );

				} else {

					setTexture( texture, value );

				}

			}

		}

	};

	function setCubeTexture( texture, slot ) {

		if ( texture.image.length == 6 ) {

			if ( !texture.image.__webGLTextureCube &&
				 !texture.image.__cubeMapInitialized && texture.image.loadCount == 6 ) {

				texture.image.__webGLTextureCube = _gl.createTexture();

				_gl.bindTexture( _gl.TEXTURE_CUBE_MAP, texture.image.__webGLTextureCube );

				_gl.texParameteri( _gl.TEXTURE_CUBE_MAP, _gl.TEXTURE_WRAP_S, _gl.CLAMP_TO_EDGE );
				_gl.texParameteri( _gl.TEXTURE_CUBE_MAP, _gl.TEXTURE_WRAP_T, _gl.CLAMP_TO_EDGE );

				_gl.texParameteri( _gl.TEXTURE_CUBE_MAP, _gl.TEXTURE_MAG_FILTER, _gl.LINEAR );
				_gl.texParameteri( _gl.TEXTURE_CUBE_MAP, _gl.TEXTURE_MIN_FILTER, _gl.LINEAR_MIPMAP_LINEAR );

				for ( var i = 0; i < 6; ++i ) {

					_gl.texImage2D( _gl.TEXTURE_CUBE_MAP_POSITIVE_X + i, 0, _gl.RGBA, _gl.RGBA, _gl.UNSIGNED_BYTE, texture.image[ i ] );

				}

				_gl.generateMipmap( _gl.TEXTURE_CUBE_MAP );

				_gl.bindTexture( _gl.TEXTURE_CUBE_MAP, null );

				texture.image.__cubeMapInitialized = true;

			}

			_gl.activeTexture( _gl.TEXTURE0 + slot );
			_gl.bindTexture( _gl.TEXTURE_CUBE_MAP, texture.image.__webGLTextureCube );

		}

	};

	function setTexture( texture, slot ) {

		if ( !texture.__webGLTexture && texture.image.loaded ) {

			texture.__webGLTexture = _gl.createTexture();
			_gl.bindTexture( _gl.TEXTURE_2D, texture.__webGLTexture );
			_gl.texImage2D( _gl.TEXTURE_2D, 0, _gl.RGBA, _gl.RGBA, _gl.UNSIGNED_BYTE, texture.image );

			_gl.texParameteri( _gl.TEXTURE_2D, _gl.TEXTURE_WRAP_S, paramThreeToGL( texture.wrap_s ) );
			_gl.texParameteri( _gl.TEXTURE_2D, _gl.TEXTURE_WRAP_T, paramThreeToGL( texture.wrap_t ) );

			_gl.texParameteri( _gl.TEXTURE_2D, _gl.TEXTURE_MAG_FILTER, paramThreeToGL( texture.mag_filter ) );
			_gl.texParameteri( _gl.TEXTURE_2D, _gl.TEXTURE_MIN_FILTER, paramThreeToGL( texture.min_filter ) );
			_gl.generateMipmap( _gl.TEXTURE_2D );
			_gl.bindTexture( _gl.TEXTURE_2D, null );

		}

		_gl.activeTexture( _gl.TEXTURE0 + slot );
		_gl.bindTexture( _gl.TEXTURE_2D, texture.__webGLTexture );

	};

	function cacheUniformLocations( program, identifiers ) {

		var i, l, id;

		for( i = 0, l = identifiers.length; i < l; i++ ) {

			id = identifiers[ i ];
			program.uniforms[ id ] = _gl.getUniformLocation( program, id );

		}

	};

	function cacheAttributeLocations( program, identifiers ) {

		var i, l, id;

		for( i = 0, l = identifiers.length; i < l; i++ ) {

			id = identifiers[ i ];
			program.attributes[ id ] = _gl.getAttribLocation( program, id );

		}

	};

	function initUbershader( maxDirLights, maxPointLights, fog ) {

		var vertex_shader = generateVertexShader( maxDirLights, maxPointLights ),
			fragment_shader = generateFragmentShader( maxDirLights, maxPointLights ),
			program;

		//log ( vertex_shader );
		//log ( fragment_shader );

		program = buildProgram( fragment_shader, vertex_shader, fog );

		_gl.useProgram( program );

		// matrices
		// lights
		// material properties (Basic / Lambert / Blinn-Phong shader)

		cacheUniformLocations( program, [ 'viewMatrix', 'modelViewMatrix', 'projectionMatrix', 'normalMatrix', 'objectMatrix', 'cameraPosition',
										   'enableLighting', 'ambientLightColor',
										   'material', 'mColor', 'mAmbient', 'mSpecular', 'mShininess', 'mOpacity',
										   'enableMap', 'tMap',
										   'enableCubeMap', 'tCube', 'mixEnvMap', 'mReflectivity',
										   'mRefractionRatio', 'useRefract'
		] );

		if ( fog ) {

			cacheUniformLocations( program, [ 'fogColor', 'fogNear', 'fogFar', 'fogDensity' ] );

		}

		if ( maxDirLights ) {

			cacheUniformLocations( program, [ 'directionalLightNumber', 'directionalLightColor', 'directionalLightDirection' ] );

		}

		if ( maxPointLights ) {

			cacheUniformLocations( program, [ 'pointLightNumber', 'pointLightColor', 'pointLightPosition' ] );

		}

		// texture (diffuse map)

		_gl.uniform1i( program.uniforms.enableMap, 0 );
		_gl.uniform1i( program.uniforms.tMap, 0 );

		// cube texture

		_gl.uniform1i( program.uniforms.enableCubeMap, 0 );
		_gl.uniform1i( program.uniforms.tCube, 1 ); // it's important to use non-zero texture unit, otherwise it doesn't work
		_gl.uniform1i( program.uniforms.mixEnvMap, 0 );

		// refraction

		_gl.uniform1i( program.uniforms.useRefract, 0 );

		// attribute arrays

		cacheAttributeLocations( program, [ "position", "normal", "uv" ] );

		return program;

	};

	function getShader( type, string ) {

		var shader;

		if ( type == "fragment" ) {

			shader = _gl.createShader( _gl.FRAGMENT_SHADER );

		} else if ( type == "vertex" ) {

			shader = _gl.createShader( _gl.VERTEX_SHADER );

		}

		_gl.shaderSource( shader, string );
		_gl.compileShader( shader );

		if ( !_gl.getShaderParameter( shader, _gl.COMPILE_STATUS ) ) {

			alert( _gl.getShaderInfoLog( shader ) );
			return null;

		}

		return shader;

	};

	function paramThreeToGL( p ) {

		switch ( p ) {

			case THREE.RepeatWrapping: return _gl.REPEAT; break;
			case THREE.ClampToEdgeWrapping: return _gl.CLAMP_TO_EDGE; break;
			case THREE.MirroredRepeatWrapping: return _gl.MIRRORED_REPEAT; break;

			case THREE.NearestFilter: return _gl.NEAREST; break;
			case THREE.NearestMipMapNearestFilter: return _gl.NEAREST_MIPMAP_NEAREST; break;
			case THREE.NearestMipMapLinearFilter: return _gl.NEAREST_MIPMAP_LINEAR; break;

			case THREE.LinearFilter: return _gl.LINEAR; break;
			case THREE.LinearMipMapNearestFilter: return _gl.LINEAR_MIPMAP_NEAREST; break;
			case THREE.LinearMipMapLinearFilter: return _gl.LINEAR_MIPMAP_LINEAR; break;

		}

		return 0;

	};

	function materialNeedsSmoothNormals( material ) {

		return material && material.shading != undefined && material.shading == THREE.SmoothShading;

	};

	function bufferNeedsSmoothNormals( geometryChunk, object ) {

		var m, ml, i, l, needsSmoothNormals = false;

		for ( m = 0, ml = object.materials.length; m < ml; m++ ) {

			meshMaterial = object.materials[ m ];

			if ( meshMaterial instanceof THREE.MeshFaceMaterial ) {

				for ( i = 0, l = geometryChunk.materials.length; i < l; i++ ) {

					if ( materialNeedsSmoothNormals( geometryChunk.materials[ i ] ) ) {

						needsSmoothNormals = true;
						break;

					}

				}

			} else {

				if ( materialNeedsSmoothNormals( meshMaterial ) ) {

					needsSmoothNormals = true;
					break;

				}

			}

			if ( needsSmoothNormals ) break;

		}

		return needsSmoothNormals;

	};

	function allocateLights( scene, maxLights ) {

		if ( scene ) {

			var l, ll, light, dirLights = pointLights = maxDirLights = maxPointLights = 0;

			for ( l = 0, ll = scene.lights.length; l < ll; l++ ) {

				light = scene.lights[ l ];

				if ( light instanceof THREE.DirectionalLight ) dirLights++;
				if ( light instanceof THREE.PointLight ) pointLights++;

			}

			if ( ( pointLights + dirLights ) <= maxLights ) {

				maxDirLights = dirLights;
				maxPointLights = pointLights;

			} else {

				maxDirLights = Math.ceil( maxLights * dirLights / ( pointLights + dirLights ) );
				maxPointLights = maxLights - maxDirLights;

			}

			return { 'directional' : maxDirLights, 'point' : maxPointLights };

		}

		return { 'directional' : 1, 'point' : maxLights - 1 };

	};

	/* DEBUG
	function getGLParams() {

		var params  = {

			'MAX_VARYING_VECTORS': _gl.getParameter( _gl.MAX_VARYING_VECTORS ),
			'MAX_VERTEX_ATTRIBS': _gl.getParameter( _gl.MAX_VERTEX_ATTRIBS ),

			'MAX_TEXTURE_IMAGE_UNITS': _gl.getParameter( _gl.MAX_TEXTURE_IMAGE_UNITS ),
			'MAX_VERTEX_TEXTURE_IMAGE_UNITS': _gl.getParameter( _gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS ),
			'MAX_COMBINED_TEXTURE_IMAGE_UNITS' : _gl.getParameter( _gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS ),

			'MAX_VERTEX_UNIFORM_VECTORS': _gl.getParameter( _gl.MAX_VERTEX_UNIFORM_VECTORS ),
			'MAX_FRAGMENT_UNIFORM_VECTORS': _gl.getParameter( _gl.MAX_FRAGMENT_UNIFORM_VECTORS )
		}

		return params;
	};

	function dumpObject( obj ) {

		var p, str = "";
		for ( p in obj ) {

			str += p + ": " + obj[p] + "\n";

		}

		return str;
	}
	*/

	var ShaderLib = {

		'depth': {

			uniforms: { "mNear": { type: "f", value: 1.0 },
						"mFar" : { type: "f", value: 2000.0 } },

			fragment_shader: [

				"uniform float mNear;",
				"uniform float mFar;",

				"void main() {",

					"float depth = gl_FragCoord.z / gl_FragCoord.w;",
					"float color = 1.0 - smoothstep( mNear, mFar, depth );",
					"gl_FragColor = vec4( vec3( color ), 1.0 );",

				"}"

			].join("\n"),

			vertex_shader: [

				"void main() {",

					"gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );",

				"}"

			].join("\n")

		},

		'normal': {

			uniforms: { },

			fragment_shader: [

				"varying vec3 vNormal;",

				"void main() {",

					"gl_FragColor = vec4( 0.5 * normalize( vNormal ) + 0.5, 1.0 );",

				"}"

			].join("\n"),

			vertex_shader: [

				"varying vec3 vNormal;",

				"void main() {",

					"vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );",
					"vNormal = normalize( normalMatrix * normal );",

					"gl_Position = projectionMatrix * mvPosition;",

				"}"

			].join("\n")

		}

	};

};
