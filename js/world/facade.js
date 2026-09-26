/* =========================================================
   FACHADA DEL EDIFICIO (vista exterior del arranque)
   Un edificio de viviendas normal: fachada de ladrillo y hormigón con la misma retícula que el loft
   (dos ventanales de acero por vivienda, forjado cada 4 m) que continúa muchas plantas arriba y abajo.
   Cada ventana muestra un INTERIOR calculado por "interior mapping" (rayo contra una habitación virtual):
   paredes pintadas, suelo de madera, techo, luz encendida o no, sofá, mesa, estantería, cama, lámpara, plantas,
   personas (de pie o sentadas), tele encendida, cortinas y persianas. Todo en un único plano con shader.
   El hueco del loft real queda recortado (discard) para que se vean sus ventanales reales.
   ========================================================= */
import * as THREE from 'three';
import { signTex, posterTex, flyerTex } from './brand.js';
import { SKY_HAZE } from './city.js';

const SUN = new THREE.Vector3(-.62, .55, -.32).normalize();

function buildFacadePlane(q) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uSun: { value: SUN }, uHaze: { value: SKY_HAZE }, uQ: { value: q.name === 'low' ? 0 : q.name === 'mid' ? 1 : 2 } },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }',
    fragmentShader: /* glsl */`
      varying vec3 vW; uniform float uTime,uQ; uniform vec3 uSun,uHaze;
      float h1(float n){ return fract(sin(n*127.1+.7)*43758.5453); }
      float h2(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float vn(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h2(i),h2(i+vec2(1,0)),f.x),mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),f.x),f.y); }

      float fbm(vec2 p){ float a=.5,s=0.; for(int i=0;i<4;i++){ s+=a*vn(p); p=p*2.03+vec2(17.3,9.1); a*=.5; } return s; }
      float crackL(vec2 p){ float n=fbm(p); return 1.-smoothstep(0.,.011,abs(n-.5)); }     // contornos de ruido = grietas largas y sinuosas

      // ---- intersecciones ----
      vec2 boxT(vec3 ro,vec3 rd,vec3 bmin,vec3 bmax,out vec3 nrm){         // (tNear, hit?) con la normal de la cara
        vec3 inv=1./rd, t0=(bmin-ro)*inv, t1=(bmax-ro)*inv, tmn=min(t0,t1), tmx=max(t0,t1);
        float tn=max(max(tmn.x,tmn.y),tmn.z), tf=min(min(tmx.x,tmx.y),tmx.z);
        nrm=-sign(rd)*step(tmn.yzx,tmn.xyz)*step(tmn.zxy,tmn.xyz);
        return vec2(tn, tf>max(tn,0.)?1.:0.);
      }
      vec2 cylT(vec3 ro,vec3 rd,vec2 c,float r,float y0,float y1,out vec3 nrm){
        vec2 oc=ro.xz-c; float a=dot(rd.xz,rd.xz), b=dot(oc,rd.xz), cc=dot(oc,oc)-r*r, d=b*b-a*cc; nrm=vec3(0.);
        if(d<0.||a<1e-5) return vec2(1e9,0.);
        float t=(-b-sqrt(d))/a; float y=ro.y+rd.y*t; if(t<0.||y<y0||y>y1) return vec2(1e9,0.);
        vec3 p=ro+rd*t; nrm=normalize(vec3(p.x-c.x,0.,p.z-c.y)); return vec2(t,1.);
      }
      vec2 sphT(vec3 ro,vec3 rd,vec3 c,float r,out vec3 nrm){
        vec3 oc=ro-c; float b=dot(oc,rd), cc=dot(oc,oc)-r*r, d=b*b-cc; nrm=vec3(0.);
        if(d<0.) return vec2(1e9,0.); float t=-b-sqrt(d); if(t<0.) return vec2(1e9,0.);
        nrm=normalize(ro+rd*t-c); return vec2(t,1.);
      }

      // ---- interior de una vivienda: ro/rd en el sistema local de la habitación (x = profundidad, y = altura desde el suelo, z = ancho) ----
      vec3 interior(vec3 ro,vec3 rd,vec2 rid,bool pz){
        float sd=h2(rid), sd2=h2(rid+3.7), sd3=h2(rid+9.1);
        const vec3 RM=vec3(6.5,3.5,2.3);
        float tx=(RM.x-ro.x)/rd.x, tz=rd.z>0.?(RM.z-ro.z)/rd.z:(-RM.z-ro.z)/rd.z, ty=rd.y>0.?(RM.y-ro.y)/rd.y:(0.-ro.y)/rd.y;
        float t=min(tx,min(tz,ty)); vec3 p=ro+rd*t;
        // paleta de paredes
        float pk=floor(sd*6.); vec3 paint=pk<1.?vec3(.86,.82,.74):pk<2.?vec3(.60,.72,.66):pk<3.?vec3(.78,.52,.44):pk<4.?vec3(.34,.42,.56):pk<5.?vec3(.90,.90,.88):vec3(.27,.28,.31);
        bool lit=pz||sd2<.5; float tvOn=pz?0.:step(.82,sd3);
        vec3 col; vec3 n;
        if(t==ty){ if(rd.y>0.){ col=vec3(.92,.91,.88); n=vec3(0,-1,0);} else { float pl=floor(p.z*5.); float g=.75+.25*h2(vec2(pl,floor(p.x*1.6)+rid.x)); col=vec3(.46,.31,.19)*g*(.85+.15*sin(p.z*60.)); n=vec3(0,1,0);} }
        else if(t==tx){ col=paint*.92; n=vec3(-1,0,0);
          // cuadro en la pared del fondo
          vec2 q2=vec2(p.z+.9-sd2*.6, p.y-1.15); if(q2.x>0.&&q2.x<1.1&&q2.y>0.&&q2.y<.85){ float m=step(.5,h2(rid+floor(q2*4.))); col=mix(vec3(.15,.13,.12),mix(vec3(.9,.45,.25),vec3(.25,.5,.7),m),.85); if(q2.x<.04||q2.x>1.06||q2.y<.04||q2.y>.81) col=vec3(.07); } }
        else { col=paint; n=vec3(0,0,-sign(rd.z)); }
        float best=t; vec3 bn=n;
        // ---- mobiliario ----
        vec3 fn; vec2 r;
        // sofá contra el fondo (o cama)
        if(sd3<.28&&!pz){ r=boxT(ro,rd,vec3(3.4,0.,-1.3+sd*.5),vec3(6.5,.5,1.0+sd*.5),fn); if(r.y>0.&&r.x>0.&&r.x<best){ best=r.x; bn=fn; col=mix(vec3(.85,.85,.9),vec3(.35,.4,.55),step(.5,sd2)); if(fn.y>.5&&ro.z+rd.z*r.x>.3+sd*.5) col=vec3(.95); }
        } else if(!pz){ r=boxT(ro,rd,vec3(5.2,0.,-1.4+sd*.8),vec3(6.4,.42,.6+sd*.8),fn); if(r.y>0.&&r.x>0.&&r.x<best){ best=r.x; bn=fn; col=sd2<.33?vec3(.78,.32,.22):sd2<.66?vec3(.35,.38,.42):vec3(.62,.55,.42); }
               r=boxT(ro,rd,vec3(5.9,.42,-1.4+sd*.8),vec3(6.5,.95,.6+sd*.8),fn); if(r.y>0.&&r.x>0.&&r.x<best){ best=r.x; bn=fn; col=sd2<.33?vec3(.7,.28,.2):sd2<.66?vec3(.3,.33,.38):vec3(.56,.5,.38); } }
        // pizzería: dos mesas con mantel de cuadros rojos y blancos, barra al fondo y hornos
        if(pz){ for(int k=0;k<2;k++){ float kz=k==0?-1.0:.9, kx=k==0?2.2:3.6; r=boxT(ro,rd,vec3(kx,.0,kz),vec3(kx+.9,.76,kz+.9),fn); if(r.y>0.&&r.x>0.&&r.x<best){ best=r.x; bn=fn; vec3 pp=ro+rd*r.x; float ck=mod(floor(pp.x*9.)+floor(pp.z*9.),2.); col=mix(vec3(.85,.12,.1),vec3(.95,.93,.88),ck); } }
          r=boxT(ro,rd,vec3(5.9,0.,-2.2),vec3(6.5,1.05,2.2),fn); if(r.y>0.&&r.x>0.&&r.x<best){ best=r.x; bn=fn; col=fn.y>.5?vec3(.75,.7,.62):vec3(.42,.16,.1); }
          r=boxT(ro,rd,vec3(6.2,1.05,-1.3),vec3(6.5,2.3,-.3),fn); if(r.y>0.&&r.x>0.&&r.x<best){ best=r.x; bn=fn; col=fn.x<-.5?vec3(2.3,1.1,.35):vec3(.25,.12,.08); } }
        // mesa baja
        if(sd2>.3&&!pz){ r=boxT(ro,rd,vec3(3.6,.0,-.5+sd3*.6),vec3(4.4,.4,.3+sd3*.6),fn); if(r.y>0.&&r.x>0.&&r.x<best){ best=r.x; bn=fn; col=vec3(.5,.36,.24); } }
        // estantería alta en la pared lateral
        if(sd>.45){ r=boxT(ro,rd,vec3(1.8+sd2*1.5,0.,1.95),vec3(3.9+sd2*1.5,2.0,2.3),fn); if(r.y>0.&&r.x>0.&&r.x<best){ best=r.x; bn=fn; vec3 pp=ro+rd*r.x; float row=floor(pp.y*4.); col=fn.z<-.5?mix(vec3(.4,.3,.2),vec3(.8,.35,.2)*h2(vec2(floor(pp.x*9.),row))+.15,step(.4,h2(vec2(floor(pp.x*9.),row+rid.x)))*step(.07,fract(pp.y*4.))):vec3(.45,.33,.22); } }
        // lámpara de pie (cilindro fino con pantalla emisiva)
        if(sd3>.5&&sd3<.85){ r=cylT(ro,rd,vec2(4.9,-1.85),.13,1.2,1.75,fn); if(r.y>0.&&r.x<best){ best=r.x; bn=fn; col=vec3(1.,.86,.6)*(lit?2.4:1.1); } r=cylT(ro,rd,vec2(4.9,-1.85),.02,0.,1.2,fn); if(r.y>0.&&r.x<best){ best=r.x; bn=fn; col=vec3(.1); } }
        // planta
        if(sd2<.55){ r=cylT(ro,rd,vec2(2.6,-1.75),.17,0.,.4,fn); if(r.y>0.&&r.x<best){ best=r.x; bn=fn; col=vec3(.62,.36,.24); } r=sphT(ro,rd,vec3(2.6,.78,-1.75),.42,fn); if(r.y>0.&&r.x<best){ best=r.x; bn=fn; col=vec3(.2,.42,.2)*(.7+.5*h2(rid+floor((ro+rd*r.x)*7.).xz)); } }
        // tele
        if(tvOn>.5){ r=boxT(ro,rd,vec3(6.3,.6,-.9),vec3(6.5,1.4,.3),fn); if(r.y>0.&&r.x>0.&&r.x<best){ best=r.x; bn=fn; vec3 tc=.5+.5*sin(uTime*(.8+sd)+vec3(0.,2.1,4.2)+sd*9.); col=fn.x<-.5?tc*2.2:vec3(.05); } }
        // persona
        float pers=pz?1.:step(.4,h1(sd*13.7)); if(pers>.5){
          float pz=-1.0+h1(sd*5.1)*1.8, px=1.3+h1(sd*3.3)*2.2; float sit=step(.5,h1(sd*7.7));
          vec3 cn; vec2 rc;
          if(sit>.5){ px=5.6; rc=cylT(ro,rd,vec2(px,pz),.19,.42,1.05,cn); }
          else { rc=cylT(ro,rd,vec2(px,pz),.2,.85,1.5,cn);
            vec3 cl; vec2 rl=cylT(ro,rd,vec2(px,pz),.13,.03,.86,cl); if(rl.y>0.&&rl.x<best){ best=rl.x; bn=cl; col=vec3(.14,.16,.24); } }
          if(rc.y>0.&&rc.x<best){ best=rc.x; bn=cn; float ck=h1(sd*19.3); col=ck<.25?vec3(.15,.2,.35):ck<.5?vec3(.7,.2,.2):ck<.75?vec3(.85,.85,.8):vec3(.2,.5,.35); }
          float hy=sit>.5?1.22:1.62; vec2 rs=sphT(ro,rd,vec3(px,hy,pz),.115,cn);
          if(rs.y>0.&&rs.x<best){ best=rs.x; bn=cn; float sk=h1(sd*29.9); col=mix(vec3(.85,.62,.5),vec3(.42,.27,.2),sk); }
        }
        // iluminación: luz de día (decae con la profundidad) + lámpara de techo si está encendida
        vec3 hp=ro+rd*best; float d2=dot(hp-vec3(3.2,3.2,0.),hp-vec3(3.2,3.2,0.));
        vec3 day=vec3(.90,.93,.98)*(.16+.62*exp(-hp.x*.30))*(.75+.25*max(-bn.x+.5,0.));
        vec3 lamp=(lit?1.:0.)*vec3(1.,.80,.52)*1.9/(1.+.14*d2);
        vec3 shade=day+lamp+.025;
        if(col.r>1.4||col.g>1.4||col.b>1.4) return col;                     // emisivo (tele, lámpara)
        return col*shade;
      }

      void main(){
        float z=vW.z, y=vW.y;
        
        vec3 N=vec3(-1,0,0);
        float uz=mod(z+4.6,9.2), unit=floor((z+4.6)/9.2);
        float fl=floor(y/4.), yy=y-4.*fl;
        bool wA=uz>.9&&uz<4.0, wB=uz>5.2&&uz<8.3;
        bool inWin=(wA||wB)&&yy>.55&&yy<3.05;
        float wz=wA?uz-.9:uz-5.2, wy=yy-.55;
        float zc=(unit*9.2-4.6)+(wA?2.45:6.75);
        vec3 V=vW-cameraPosition; float dist=length(V); vec3 rd=V/dist;
        if(unit<.5&&unit>-.5&&fl<.5&&fl>-.5&&inWin) discard;                 // los ventanales reales del loft
        vec3 col;
        float sunL=clamp(dot(N,uSun)*.5+.5,0.,1.);
        vec3 light=(vec3(1.,.95,.84)*(.3+.75*sunL)+vec3(.45,.55,.72)*.3)*.72;
        if(inWin){
          // marco de acero: perimetro, dos montantes y un travesaño a 2.35 m
          float fw=.06; bool frame=wz<fw||wz>3.1-fw||wy<fw||wy>2.5-fw||abs(wz-1.0333)<.03||abs(wz-2.0667)<.03||abs(wy-1.8)<.03;
          bool pz=abs(unit)<.5&&abs(fl+1.)<.5;
          vec2 rid0=vec2(unit*2.+(wB?1.:0.),fl); float board=pz?0.:step(.87,h2(rid0+21.)), cracked=pz?0.:step(.90,h2(rid0+31.));
          if(board>.5){                                                        // ventana tapiada con tablones
            float pl=floor(wz*4.4); float g=.5+.35*h2(vec2(pl,rid0.x)); vec3 wd=mix(vec3(.30,.24,.18),vec3(.46,.38,.28),g)*(.8+.4*vn(vec2(wz*30.,wy*3.+pl)));
            wd*=1.-.5*step(fract(wz*4.4),.035); vec2 nn=vec2(fract(wz*4.4)-.5,fract(wy*5.)-.5); wd=mix(wd,vec3(.55,.5,.44),.9*step(length(nn*vec2(.5,.14)),.022)*step(.3,fract(wy*2.5)));
            wd=mix(wd,wd*.5,smoothstep(.4,.9,fbm(vec2(wz,wy)*4.+rid0))*.6); col=wd*(.55+.6*light);
          } else if(frame){ float rs=smoothstep(.42,.62,fbm(vec2(wz,wy)*7.+rid0*3.)); col=mix(vec3(.07,.075,.085),vec3(.36,.17,.08),rs*.8)*(.6+.8*light); col=mix(col,vec3(.55,.5,.44),.55*step(.78,fbm(vec2(wz,wy)*11.+rid0))*rs); }
          else {
            vec3 ro=vec3(0.,yy,z-zc); vec3 rdl=rd; if(rdl.x<.02) rdl.x=.02;   // (habitación local: x hacia dentro)
            vec2 rid=vec2(unit*2.+(wB?1.:0.),fl);
            vec3 inn=interior(vec3(0.,yy,vW.z-zc),normalize(rdl),rid,pz);
            // persianas / cortinas
            float sd=h2(rid+11.3);
            if(pz) sd=1.;
            if(sd<.22){ float f=.25+.5*h2(rid+2.); if(wy>2.5*(1.-f)){ float sl=step(.35,fract(wy*14.)); inn=mix(inn,vec3(.86,.84,.8)*(.7+.3*sl),.92); } }
            else if(sd<.42){ float side=step(.5,h2(rid+5.)); float cw=wz-1.55, sg=side*2.-1.; float edge=-.5+.05*sin(wy*2.+rid.x); if(cw*sg<edge){ float pleat=.78+.22*sin(wz*38.+rid.x); inn=mix(inn,vec3(.92,.88,.82)*pleat,.78); } }
            // reflejo del cielo + Fresnel + destello diagonal
            float cs=clamp(rd.x,0.,1.); float fr=pow(1.-cs,3.);
            vec3 sky=mix(vec3(.60,.74,.90),vec3(.86,.92,.98),clamp(wy/2.5,0.,1.));
            float streak=smoothstep(.8,.98,sin((wz*1.4+wy*.9)*1.9))*.05;
            col=mix(inn,sky,.10+fr*.42)+streak;
            // vidrio sucio: película de polvo y goteos; algún cristal roto/fisurado
            float dirtG=fbm(vec2(wz*2.,wy*.7)+rid0*2.); float drip=smoothstep(.55,.9,vn(vec2(wz*26.,wy*.35+rid0.x)))*smoothstep(.0,1.8,2.5-wy);
            col=mix(col,vec3(.55,.55,.5),clamp(.14+.28*dirtG+.22*drip,0.,.6)*(pz?.45:1.));
            if(cracked>.5){ vec2 cp=vec2(wz-1.2-h2(rid0)*1.2,wy-1.1-h2(rid0+1.)); float ang=atan(cp.y,cp.x), rr=length(cp); float rad=1.-smoothstep(0.,.014,abs(sin(ang*5.+h2(rid0+2.)*6.))*rr*.55); rad*=step(rr,1.1)*step(.03,rr); float rng=1.-smoothstep(0.,.012,abs(fract(rr*4.5)-.5)*.1); col=mix(col,vec3(.9,.92,.95),(rad*.55+rng*step(rr,.7)*.25)); }
            col*=1.-.35*(smoothstep(.0,.12,min(min(wz,3.1-wz),min(wy,2.5-wy)))<1.?1.:0.)*(1.-smoothstep(.0,.12,min(min(wz,3.1-wz),min(wy,2.5-wy))));   // sombra del retranqueo
          }
        } else if(yy<3.05){
          // antepecho y machones de ladrillo (el machón central va encalado)
          bool cen=uz>4.0&&uz<5.2&&yy>.55;
          vec2 bc=vec2((z+(mod(floor(y/.065),2.)*.5*.215))/.215,y/.065); vec2 bi=floor(bc), bf=fract(bc);
          float mortar=step(bf.x,.05)+step(bf.y,.10); float vr=h2(bi);
          vec3 brick=mix(vec3(.46,.20,.16),vec3(.60,.32,.24),vr)*(.85+.3*vn(bc*.8)); brick=mix(brick,vec3(.72,.66,.58),step(.985,h2(bi+3.)))*(1.-.25*step(.8,vr));
          vec3 white=vec3(.78,.76,.72)*(.88+.2*vn(bc*.5));
          // ladrillos: ensuciados, algunos desconchados o caídos; el enlucido del machón se despega mostrando el ladrillo
          float f1=fbm(vec2(z,y)*.42), f2=fbm(vec2(z,y)*1.9+7.);
          brick*=mix(vec3(1.),vec3(.72,.66,.60),f1); brick=mix(brick,brick*vec3(.8,.85,.9),.4*f2);
          float miss=step(.985,h2(bi+7.)), chip=step(.93,h2(bi+13.))*step(.55,bf.x*.6+bf.y);
          brick=mix(brick,vec3(.10,.07,.06),miss*step(.12,bf.x)*step(bf.x,.9)*step(.18,bf.y)*step(bf.y,.86)); brick=mix(brick,brick*.6+vec3(.10,.08,.06),chip*.7);
          vec3 mort=mix(vec3(.36,.33,.3),vec3(.22,.20,.19),f2);
          if(cen){ float pl=smoothstep(.50,.57,fbm(vec2(z*1.4,y*.55)+3.)); float edgeP=smoothstep(.57,.5,fbm(vec2(z*1.4,y*.55)+3.))*pl;
            white=mix(white,white*vec3(.78,.74,.68),smoothstep(.3,.7,f1)); vec3 under=mix(brick,vec3(.46,.39,.32),.35); white=mix(white,under,pl); white=mix(white,white*.6,edgeP*1.2); }
          col=mix(cen?white:brick,mort,clamp(mortar,0.,1.)*(cen?.35*(1.-smoothstep(.50,.57,fbm(vec2(z*1.4,y*.55)+3.)))+.001:.7));
          col*=1.-.5*max(crackL(vec2(z,y)*vec2(1.3,.7)+2.),.8*crackL(vec2(z,y)*vec2(3.1,1.7)))*(cen?1.:.5);
          col*=light;
          // alféizar claro
          if(yy>.5&&yy<.56&&!cen&&(wA||wB||true)) col=vec3(.66,.64,.6)*light;
          // chorretones bajo las ventanas
          float st=vn(vec2(z*9.,y*.8)); col*=1.-.30*smoothstep(.45,.9,st)*smoothstep(.0,.9,3.05-yy);
          float sk=vn(vec2(z*17.,y*.22))*vn(vec2(z*2.4,y*.1+4.)); col*=1.-.42*smoothstep(.22,.62,sk)*smoothstep(.0,1.2,yy);   // regueros verticales de lluvia bajo cada alféizar
          float sal=smoothstep(.58,.8,fbm(vec2(z*3.,y*1.1)+9.))*smoothstep(1.6,.3,yy); col=mix(col,vec3(.72,.70,.64)*light,sal*.42);   // salitre
        } else {
          // forjado y dintel de hormigón encofrado
          float board=floor(y/.6); vec3 cc=vec3(.60,.585,.55)*(.92+.14*h2(vec2(board,unit))); cc*=.88+.2*vn(vec2(z*3.,y*14.));
          cc*=1.-.2*step(fract(y/.6),.03); cc*=1.-.18*step(mod(y,4.0),3.12)*step(3.05,mod(y,4.0));
          float sp=smoothstep(.56,.62,fbm(vec2(z*1.7,y*2.2)+5.)); cc=mix(cc,vec3(.30,.27,.24),sp*.8); cc=mix(cc,vec3(.34,.16,.07),step(.5,sp)*smoothstep(.5,.8,vn(vec2(z*40.,y*3.)))*.7);   // hormigón desprendido con armadura oxidada
          cc*=1.-.5*smoothstep(.4,.85,vn(vec2(z*15.,y*.5)))*(.6+.4*(1.-fract(y/4.)));          // manchas de humedad
          cc*=1.-.5*max(crackL(vec2(z,y)*vec2(.9,1.6)+11.),.7*crackL(vec2(z,y)*vec2(2.7,3.)));
          col=cc*light;
        }
        // envejecimiento general: desaturado y apagado, hollín hacia abajo
        col=mix(col,vec3(dot(col,vec3(.33,.36,.31))),.22); col*=.93-.10*smoothstep(0.,1.,fbm(vec2(z*.2,y*.12)+1.));
        // la vivienda de los personajes: resplandor cálido que se derrama de sus ventanales sobre la fachada
        float gdx=max(abs(z)-3.7,0.), gdy=max(abs(y-1.8)-1.25,0.);
        float glow=exp(-(gdx*gdx+gdy*gdy)/(2.0*2.0)), wide=exp(-(gdx*gdx+gdy*gdy)/(2.0*6.5*6.5));
        col*=mix(.80,1.,wide);                                                // los vecinos quedan un poco más apagados
        col=mix(col,col*vec3(1.18,1.05,.84),glow*.85); col+=vec3(1.,.66,.36)*.10*glow;
        // niebla atmosférica como la ciudad
        float fog=1.-exp(-dist*dist*.0000058); fog=max(fog,smoothstep(0.,1.,(dist-90.)/300.)*.18);
        col=mix(col,uHaze*.9,clamp(fog,0.,.9));
        gl_FragColor=vec4(col*.8,1.);
      }`,
    side: THREE.FrontSide,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(260, 70), mat);
  m.rotation.y = -Math.PI / 2; m.position.set(-3.668, -22, 0); m.userData.noMerge = true; m.frustumCulled = false; m.name = 'facade';
  return m;
}



/* ============================ PLANTAS REALISTAS ============================
   Hojas y flores como tarjetas con textura pintada (nervios, degradado, borde festoneado), instanciadas, con balanceo suave en el shader. */
export const SWAY = { value: 0 };
function leafTex(kind) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); g.translate(128, 246);
  const R = 108, pts = [];
  if (kind === 'round') {                                             // hoja de geranio: redondeada, festoneada, con muesca en la base
    for (let i = 0; i <= 120; i++) { const th = -Math.PI + i / 120 * Math.PI * 2; let r = R * (1 + .045 * Math.cos(11 * th)); r *= 1 - .42 * Math.exp(-Math.pow((th - Math.PI / 2) / .22, 2)) - .42 * Math.exp(-Math.pow((th + 1.5 * Math.PI) / .22, 2)); pts.push([Math.cos(th) * r * .95, -R + Math.sin(th) * r * .9]); }
  } else {                                                            // hiedra: 5 lóbulos puntiagudos
    const tips = [[-90, 1], [-90 - 48, .82], [-90 + 48, .82], [-90 - 100, .55], [-90 + 100, .55]].sort((a, b) => a[0] - b[0]);
    const seq = []; for (let k = 0; k < tips.length; k++) { seq.push([tips[k][0], tips[k][1]]); if (k < tips.length - 1) seq.push([(tips[k][0] + tips[k + 1][0]) / 2, .42]); }
    seq.unshift([-215, .3]); seq.push([35, .3]);
    for (const [a, r] of seq) pts.push([Math.cos(a * Math.PI / 180) * R * r * 1.25, -R * .55 + Math.sin(a * Math.PI / 180) * R * r * 1.05]);
    pts.push([0, 0]);
  }
  g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath();
  const gr = g.createRadialGradient(0, -R * .5, 8, 0, -R * .5, R * 1.1); gr.addColorStop(0, kind === 'round' ? '#5cae4c' : '#3f8e46'); gr.addColorStop(.6, kind === 'round' ? '#3c8a3a' : '#2c6f38'); gr.addColorStop(1, kind === 'round' ? '#2a6a2c' : '#1f5a2e');
  g.fillStyle = gr; g.fill(); g.lineWidth = 3; g.strokeStyle = 'rgba(20,60,25,.55)'; g.stroke();
  g.save(); g.clip();
  if (kind === 'round') { g.strokeStyle = 'rgba(70,40,25,.28)'; g.lineWidth = 9; g.beginPath(); g.arc(0, -R * .95, R * .58, .4, Math.PI - .4); g.stroke(); }   // zona oscura anular típica del geranio
  // nervios
  g.strokeStyle = 'rgba(215,240,185,.55)'; g.lineWidth = 3.4; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -R * 1.7); g.stroke();
  g.lineWidth = 1.8; g.strokeStyle = 'rgba(215,240,185,.38)';
  for (let i = 1; i < 8; i++) for (const sd of [-1, 1]) { const y = -i * R * .19; g.beginPath(); g.moveTo(0, y); g.quadraticCurveTo(sd * R * .3, y - R * .07, sd * R * (.55 + .3 * Math.sin(i * .4)), y - R * .22); g.stroke(); }
  // motas y luz
  for (let i = 0; i < 380; i++) { g.fillStyle = `rgba(${Math.random() < .5 ? '255,255,220' : '10,40,15'},${.03 + Math.random() * .06})`; g.fillRect((Math.random() - .5) * 2 * R, -Math.random() * R * 1.9, 1 + Math.random() * 3, 1 + Math.random() * 3); }
  g.restore();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function flowerTex() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  const flower = (x, y, r, rot) => {
    for (let k = 0; k < 5; k++) { const a = rot + k / 5 * Math.PI * 2; g.save(); g.translate(x, y); g.rotate(a); const pg = g.createRadialGradient(0, -r * .5, 1, 0, -r * .5, r * .8); pg.addColorStop(0, '#d9d9d9'); pg.addColorStop(.4, '#ffffff'); pg.addColorStop(1, '#f2f2f2'); g.fillStyle = pg; g.beginPath(); g.ellipse(0, -r * .58, r * .42, r * .62, 0, 0, 7); g.fill(); g.strokeStyle = 'rgba(120,120,120,.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, -r * .1); g.lineTo(0, -r * .95); g.stroke(); g.restore(); }
    g.fillStyle = '#e8c74a'; g.beginPath(); g.arc(x, y, r * .16, 0, 7); g.fill(); g.fillStyle = 'rgba(120,80,0,.5)'; g.beginPath(); g.arc(x, y, r * .07, 0, 7); g.fill();
  };
  const spots = [[128, 130, 54, .3], [62, 90, 40, 1.1], [196, 96, 44, .7], [84, 196, 42, 2.0], [184, 194, 40, 1.6], [128, 50, 30, 0.2], [40, 160, 26, .9]];
  for (const [x, y, r, rot] of spots) flower(x, y, r, rot);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function plantMat(map, extra = {}) {
  const m = new THREE.MeshStandardMaterial({ map, alphaTest: .42, side: THREE.DoubleSide, roughness: .55, metalness: 0, ...extra });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uSway = SWAY;
    sh.vertexShader = 'uniform float uSway;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float ph=instanceMatrix[3].z*2.7+instanceMatrix[3].y*1.9;
        transformed.x+=sin(uSway*1.5+ph)*.06*position.y*position.y; transformed.z+=cos(uSway*1.2+ph*1.3)*.05*position.y*position.y;
      #endif`);
  };
  return m;
}
/* acumulador de tarjetas: pos, dirección de crecimiento, normal preferida, tamaño y color */
function cardSet() { return { round: [], ivy: [], flower: [], vines: [] }; }
const _m4 = new THREE.Matrix4(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _n = new THREE.Vector3(), _pos = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Quaternion(), _one = new THREE.Vector3(1, 1, 1);
function card(list, pos, up, size, tint, aspect = 1) {
  _u.copy(up).normalize(); _n.set(-1, .15, 0); _n.addScaledVector(_u, -_n.dot(_u)); if (_n.lengthSq() < 1e-4) _n.set(0, 0, 1); _n.normalize(); _r.crossVectors(_u, _n).normalize();
  _m4.makeBasis(_r, _u, _n); _q.setFromRotationMatrix(_m4); _pos.copy(pos); _s.set(size * aspect, size, 1);
  list.push({ m: new THREE.Matrix4().compose(_pos, _q, _s), c: tint.clone() });
}
function flush(G, set, geoCache) {
  const mk = (list, map, name, extra) => { if (!list.length) return; const geo = new THREE.PlaneGeometry(1, 1); geo.translate(0, .5, 0); const im = new THREE.InstancedMesh(geo, plantMat(map, extra), list.length); list.forEach((it, i) => { im.setMatrixAt(i, it.m); im.setColorAt(i, it.c); }); im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; im.userData.noMerge = true; im.frustumCulled = false; im.name = name; G.add(im); };
  mk(set.round, leafTex('round'), 'leavesRound'); mk(set.ivy, leafTex('ivy'), 'leavesIvy'); mk(set.flower, flowerTex(), 'flowers', { roughness: .45, alphaTest: .5 });
  for (const v of set.vines) { const t = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(v), 20, .0028, 4), new THREE.MeshStandardMaterial({ color: 0x3a5a2a, roughness: .8 })); t.userData.noMerge = true; G.add(t); }
}
const _c = new THREE.Color();
const green = (r, dead) => (dead ? _c.setRGB(.75 + r() * .35, .55 + r() * .3, .28 + r() * .12) : _c.setRGB(.55 + r() * .5, .7 + r() * .4, .5 + r() * .3)).clone();
/* jardinera completa en (X, y, zc): follaje de geranio, flores, hiedra colgante; rich = más densidad */
function windowPlanter(set, X, y, zc, rich, r, dead = false) {
  const n = rich ? 130 : 40, fl = rich ? 40 : 12, vn = rich ? 18 : 5;
  for (let i = 0; i < n; i++) { const t = r(), z = zc - 1.25 + t * 2.5, lean = -.25 - r() * .5; card(set.round, new THREE.Vector3(X - .18 + (r() - .5) * .18, y - .015, z), new THREE.Vector3(lean, 1 + r() * .6, (r() - .5) * 1.1), .15 + r() * .12, green(r, dead)); }
  const pal = [0xff4d79, 0xffd24a, 0xff8a3d, 0xf3f3f3, 0xb25cff, 0xff2f4f, 0xff9cbb];
  for (let i = 0; i < fl; i++) { const z = zc - 1.2 + r() * 2.4; card(set.flower, new THREE.Vector3(X - .21 + (r() - .5) * .12, y + .12 + r() * .16, z), new THREE.Vector3(-.5 - r() * .3, .5 + r() * .4, (r() - .5) * .8), .15 + r() * .09, new THREE.Color(pal[Math.floor(r() * pal.length)])); }
  for (let v = 0; v < vn; v++) {                                      // hiedra colgante por delante de la fachada
    const z0 = zc - 1.2 + r() * 2.4, len = .4 + r() * (rich ? .95 : .5), pts = [], nl = Math.floor(len / .07);
    for (let k = 0; k <= 12; k++) { const u = k / 12; pts.push(new THREE.Vector3(X - .345 - .02 * Math.sin(u * 3) - u * .015, y + .04 - u * len, z0 + Math.sin(u * 4 + v) * .04)); }
    set.vines.push(pts);
    for (let k = 0; k < nl; k++) { const u = k / nl, p = pts[Math.min(12, Math.floor(u * 12))]; card(set.ivy, new THREE.Vector3(p.x - .01, p.y + (r() - .5) * .03, p.z + (r() - .5) * .05), new THREE.Vector3((r() - .5) * .7, -1, (r() - .5) * .9), .075 + r() * .045, green(r, dead)); }
  }
}
/* hiedra trepando por el machón central del loft */
function climbingIvy(set, X, r) {
  for (let i = 0; i < 150; i++) { const t = Math.pow(r(), 1.6), y = .7 + t * 2.3, z = (r() - .5) * 1.05 + Math.sin(y * 2.2) * .12; card(set.ivy, new THREE.Vector3(X - .025 - r() * .03, y, z), new THREE.Vector3((r() - .5) * 1.2, (r() - .3) * 1.4, (r() - .5) * 1.2), .085 + r() * .06, green(r)); }
  const vines = []; for (let v = 0; v < 6; v++) { const pts = [], z0 = (r() - .5) * .8; for (let k = 0; k <= 10; k++) pts.push(new THREE.Vector3(X - .02, .6 + k * .24, z0 + Math.sin(k * .8 + v) * .09)); vines.push(pts); } set.vines.push(...vines);
}

/* máscara del foco (idéntica a la del shader): 1 en el ventanal del loft, decae alrededor */
const spotAt = (z, y) => { const ry = Math.max(.8, (12.2 - y) * .30 + .9); return Math.exp(-Math.pow(z / ry, 2) * 1.4) * (.4 + .6 * Math.exp(-Math.pow((y - 1.8) / 7.5, 2))); };
const dim = () => 1;

export function buildFacade(q) {
  const G = new THREE.Group(); G.name = 'facadeGroup'; G.userData.noMerge = true;
  const plane = buildFacadePlane(q); G.add(plane); G.userData.mat = plane.material;
  const X = -3.668, low = q.name === 'low';
  let sd = 7; const rnd = () => { sd = (sd * 16807) % 2147483647; return (sd - 1) / 2147483646; };
  const UN = low ? [-2, -1, 1, 2] : [-3, -2, -1, 1, 2, 3], FL = low ? [-2, -1, 0, 1] : [-4, -3, -2, -1, 0, 1, 2];
  const items = { rail: [], bal: [], box: [], leaf: [], ac: [] };
  for (const u of UN) for (const f of FL) for (const w of [-2.15, 2.15]) {
    const zc = u * 9.2 + w, y0 = f * 4 + .55, r = rnd();
    if (r < .34) items.rail.push([zc, y0 + .5, 0]);                       // barandilla francesa
    else if (r < .58) items.box.push([zc, y0 + .1, rnd()]);              // jardinera con flores
    else if (r < .72) items.ac.push([zc + (rnd() - .5) * 1.6, y0 - .29, rnd()]);   // aire acondicionado bajo la ventana
  }
  const col = new THREE.Color(), dummy = new THREE.Object3D();
  const inst = (geo, mat, list, place, tint) => {
    if (!list.length) return null; const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((it, i) => { place(dummy, it); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); const k = dim(dummy.position.z, dummy.position.y); col.setRGB(k, k, k); if (tint) col.multiply(tint(it)); im.setColorAt(i, col); });
    im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; im.castShadow = false; im.receiveShadow = false; im.userData.noMerge = true; im.frustumCulled = false; G.add(im); return im;
  };
  const steel = new THREE.MeshStandardMaterial({ color: 0x2a201a, roughness: .78, metalness: .35 }), rust = new THREE.MeshStandardMaterial({ color: 0x4a2c1a, roughness: .9, metalness: .2 });
  // barandilla: barra superior + barrotes
  inst(new THREE.BoxGeometry(.05, .05, 3.1), steel, items.rail, (o, it) => { o.position.set(X - .13, it[1] + .5, it[0]); o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1); });
  const bars = []; for (const it of items.rail) for (let i = 0; i < 12; i++) bars.push([it[0] - 1.42 + i * .258, it[1]]);
  inst(new THREE.BoxGeometry(.02, .5, .02), steel, bars, (o, it) => { o.position.set(X - .13, it[1] + .25, it[0]); o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1); });
  // jardineras y follaje
  inst(new THREE.BoxGeometry(.3, .2, 1.7), new THREE.MeshStandardMaterial({ color: 0x4d3626, roughness: .95 }), items.box, (o, it) => { o.position.set(X - .17, it[1], it[0]); o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1); });
  const plants = cardSet(), pr = rnd; for (const it of items.box) windowPlanter(plants, X, it[1] + .06, it[0], false, pr, it[2] < .55);
  // aires acondicionados
  inst(new THREE.BoxGeometry(.3, .5, .85), new THREE.MeshStandardMaterial({ color: 0xb9b49c, roughness: .8 }), items.ac, (o, it) => { o.position.set(X - .17, it[1], it[0]); o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1); });
  const grills = items.ac.map(it => [it[0], it[1]]);
  inst(new THREE.BoxGeometry(.02, .38, .6), new THREE.MeshStandardMaterial({ color: 0x3a3d40, roughness: .6 }), grills, (o, it) => { o.position.set(X - .325, it[1], it[0]); o.rotation.set(0, 0, 0); o.scale.set(1, 1, 1); });
  // bajantes
  for (const zp of [-13.8, 13.8, -23.0, 23.0]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, 64, 8), new THREE.MeshStandardMaterial({ color: 0x4a3a30, roughness: .85, metalness: .3 })); pipe.position.set(X - .09, -21, zp); pipe.userData.noMerge = true; G.add(pipe);
    for (let y = -50; y < 11; y += 2.2) { const br = new THREE.Mesh(new THREE.BoxGeometry(.1, .03, .1), steel); br.position.set(X - .05, y, zp); G.add(br); }
  }
  // azotea: antenas y chimenea
  { const rm = new THREE.MeshStandardMaterial({ color: 0x55585c, roughness: .6, metalness: .5 });
    for (const [zz, h] of [[-12.5, 3.2], [-7.3, 2.2], [9.6, 3.6], [15.2, 2.6]]) { const a = new THREE.Mesh(new THREE.CylinderGeometry(.02, .02, h, 5), rm); a.position.set(X - .6, 11.8 + h / 2, zz); G.add(a); const c = new THREE.Mesh(new THREE.BoxGeometry(.02, .02, 1.1), rm); c.position.set(X - .6, 11.8 + h * .8, zz); G.add(c); }
    const ch = new THREE.Mesh(new THREE.BoxGeometry(.9, 1.6, 1.2), new THREE.MeshStandardMaterial({ color: 0x8a5a48, roughness: .9 })); ch.position.set(X - 1.4, 12.4, -17); G.add(ch);
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 2.1, 16), new THREE.MeshStandardMaterial({ color: 0x6c5a4a, roughness: .8 })); tank.position.set(X - 2.6, 12.8, 6); G.add(tank);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.3, .6, 16), new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: .7 })); cap.position.set(X - 2.6, 14.15, 6); G.add(cap); }
  // ---- lo que hace destacar la vivienda de los personajes (frente a los vecinos) ----
  { const mk = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: .8, ...o });
    // guirnalda de bombillas cálidas sobre los ventanales
    const n = q.name === 'low' ? 14 : 26, pts = []; for (let i = 0; i <= 40; i++) { const u = i / 40; pts.push(new THREE.Vector3(X - .13, 3.42 - .22 * 4 * u * (1 - u), -4.1 + 8.2 * u)); }
    const cur = new THREE.CatmullRomCurve3(pts), wire = new THREE.Mesh(new THREE.TubeGeometry(cur, 60, .0035, 5), steel); wire.userData.noMerge = true; G.add(wire);
    const bm = new THREE.MeshBasicMaterial({ color: 0xffd394, toneMapped: false }), gm = new THREE.MeshBasicMaterial({ map: glowMap(), color: 0xffb35a, transparent: true, opacity: .6, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const bg = new THREE.SphereGeometry(.028, 8, 6), pg = new THREE.PlaneGeometry(.34, .34);
    for (let i = 0; i < n; i++) { const p = cur.getPoint((i + .5) / n); const b = new THREE.Mesh(bg, bm); b.position.copy(p).add(new THREE.Vector3(0, -.05, 0)); G.add(b); if (!low) { const h = new THREE.Mesh(pg, gm); h.position.copy(b.position).add(new THREE.Vector3(-.03, 0, 0)); h.rotation.y = -Math.PI / 2; h.userData.noMerge = true; h.renderOrder = 2; G.add(h); } }
    // jardineras del loft: madera con veta, tierra y plantas completas
    for (const zc of [-2.15, 2.15]) { const bx = new THREE.Mesh(new THREE.BoxGeometry(.3, .22, 2.6), mk(0x7a4b2e)); bx.position.set(X - .18, .34, zc); bx.userData.noMerge = true; G.add(bx);
      const soil = new THREE.Mesh(new THREE.BoxGeometry(.26, .02, 2.56), mk(0x2a1c12)); soil.position.set(X - .18, .455, zc); G.add(soil); windowPlanter(plants, X, .43, zc, true, rnd); }
    climbingIvy(plants, X, rnd);
    // los ventanales del loft brillan (luz cálida interior)
    for (const zc of [-2.15, 2.15]) { const wg = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 3.8), new THREE.MeshBasicMaterial({ map: glowMap(), color: 0xffb060, transparent: true, opacity: .34, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); wg.rotation.y = -Math.PI / 2; wg.position.set(X - .2, 1.8, zc); wg.renderOrder = 2; wg.userData.noMerge = true; G.add(wg); }
    // (el letrero de neón «4B» se quitó de la fachada)
  }

  // ---- cables tendidos entre ventanas, antenas parabólicas oxidadas y trapos ----
  { const cm = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: .7 });
    for (let i = 0; i < (low ? 5 : 11); i++) { const y0 = -12 + rnd() * 20, z0 = -24 + rnd() * 48, z1 = z0 + 4 + rnd() * 10, sag = .3 + rnd() * .6, xo = X - .12 - rnd() * .12;
      const pts = []; for (let k = 0; k <= 10; k++) { const u = k / 10; pts.push(new THREE.Vector3(xo, y0 + (rnd() - .5) * .02 - sag * 4 * u * (1 - u) + u * (rnd() - .3) * .4, z0 + (z1 - z0) * u)); }
      const t = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, .008, 4), cm); t.userData.noMerge = true; G.add(t); }
    const dishG = new THREE.SphereGeometry(.3, 14, 8, 0, Math.PI * 2, 0, Math.PI * .42), dishM = new THREE.MeshStandardMaterial({ color: 0xa6a397, roughness: .7, side: THREE.DoubleSide });
    for (const [zz, yy] of [[-13.6, 8.0], [-6.2, 4.3], [6.8, 8.2], [14.8, 0.5], [-14.7, -7.6], [7.7, -3.3], [-6.4, 12.0]]) { const d = new THREE.Mesh(dishG, dishM); d.position.set(X - .2, yy, zz); d.rotation.set(0, 0, Math.PI / 2 + .25); d.userData.noMerge = true; G.add(d); const arm = new THREE.Mesh(new THREE.CylinderGeometry(.008, .008, .35, 4), steel); arm.rotation.z = Math.PI / 2; arm.position.set(X - .1, yy - .05, zz); G.add(arm); } }
  // ---- LA PIZZERÍA de debajo del piso: rótulo iluminado + toldos a rayas sobre los dos ventanales de la planta -1 ----
  { const st = signTex();                                           // rótulo de marca (Anton + Yellowtail + damero), con la mugre de los años
    const board = new THREE.Mesh(new THREE.PlaneGeometry(8.4, 8.4 * 160 / 1024), new THREE.MeshBasicMaterial({ map: st, color: 0xffe9c8, toneMapped: false })); board.rotation.y = -Math.PI / 2; board.position.set(X - .1, -.47, 0); board.userData.noMerge = true; G.add(board); G.userData.pzSign = board;
    // carteles pegados en el machón entre los dos ventanales de la pizzería (mockups de calle: póster + flyer de la carta, con cinta)
    for (const [w, h, y, z, rz, tx] of [[.74, 1.11, -2.05, -.02, -.04, posterTex()], [.5, .70, -1.52, .18, .10, flyerTex()]]) {
      const pm = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tx, color: 0xd4c8b4, toneMapped: false })); pm.rotation.set(0, -Math.PI / 2, rz); pm.position.set(X - .13, y, z); pm.userData.noMerge = true; G.add(pm);
      for (const sx of [-1, 1]) { const tp = new THREE.Mesh(new THREE.PlaneGeometry(.13, .04), new THREE.MeshBasicMaterial({ color: 0xe8dcae, transparent: true, opacity: .8, toneMapped: false })); tp.rotation.set(0, -Math.PI / 2, rz + sx * .5); tp.position.set(X - .131, y + h / 2 - .01, z + sx * w * .36); tp.userData.noMerge = true; G.add(tp); }
    }
    const hg = new THREE.Mesh(new THREE.PlaneGeometry(11, 3.4), new THREE.MeshBasicMaterial({ map: glowMap(), color: 0xff8a3a, transparent: true, opacity: .34, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); hg.rotation.y = -Math.PI / 2; hg.position.set(X - .12, -.6, 0); hg.renderOrder = 2; hg.userData.noMerge = true; G.add(hg);
    // toldos
    const ac = document.createElement('canvas'); ac.width = 512; ac.height = 256; const ag = ac.getContext('2d');
    for (let i = 0; i < 12; i++) { ag.fillStyle = i % 2 ? '#efe6d2' : '#b3241c'; ag.fillRect(i * 512 / 12, 0, 512 / 12 + 1, 256); }
    for (let i = 0; i < 12; i++) { ag.fillStyle = i % 2 ? '#efe6d2' : '#b3241c'; ag.beginPath(); ag.arc(i * 512 / 12 + 512 / 24, 226, 512 / 24, 0, Math.PI); ag.fill(); }
    ag.clearRect(0, 230, 512, 26); for (let i = 0; i < 12; i++) { ag.fillStyle = i % 2 ? '#efe6d2' : '#b3241c'; ag.beginPath(); ag.arc(i * 512 / 12 + 512 / 24, 226, 512 / 24, 0, Math.PI); ag.fill(); }
    for (let i = 0; i < 700; i++) { ag.fillStyle = `rgba(30,20,10,${Math.random() * .2})`; ag.fillRect(Math.random() * 512, Math.random() * 256, 2 + Math.random() * 8, 2 + Math.random() * 40); }
    ag.fillStyle = 'rgba(20,14,8,.35)'; ag.fillRect(0, 0, 512, 10);
    const at = new THREE.CanvasTexture(ac); at.colorSpace = THREE.SRGBColorSpace; at.anisotropy = 4;
    const am = new THREE.MeshStandardMaterial({ map: at, roughness: .95, side: THREE.DoubleSide, alphaTest: .5 });
    for (const zc of [-2.15, 2.15]) { const aw = new THREE.Mesh(new THREE.PlaneGeometry(3.4, .95), am); aw.position.set(X - .48, -1.4, zc); aw.rotation.set(0, -Math.PI / 2, 0); aw.rotateX(-.62); aw.userData.noMerge = true; G.add(aw);
      const fr = new THREE.Mesh(new THREE.CylinderGeometry(.015, .015, 3.4, 5), steel); fr.rotation.x = Math.PI / 2; fr.position.set(X - .82, -1.75, zc); G.add(fr); }
    // luz cálida que sale de la pizzería
    for (const zc of [-2.15, 2.15]) { const wg = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 3.2), new THREE.MeshBasicMaterial({ map: glowMap(), color: 0xff8f3a, transparent: true, opacity: .3, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); wg.rotation.y = -Math.PI / 2; wg.position.set(X - .22, -2.2, zc); wg.renderOrder = 2; wg.userData.noMerge = true; G.add(wg); }
    G.userData.update = (t) => { const f = Math.sin(t * 37) * Math.sin(t * 11.3) > .93 ? .55 : 1; board.material.color.setScalar(f * .95 + .05); }; }
  flush(G, plants);
  return G;
}

function glowMap() { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.3, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
/* haz: estrecho arriba (junto al foco), se abre y se desvanece hacia abajo */
function beamMap() {
  const W = 256, H = 512, c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'), img = g.createImageData(W, H);
  for (let j = 0; j < H; j++) { const y = 13 - (j / H) * 26, ry = Math.max(.8, (12.2 - y) * .30 + .9), fade = Math.exp(-Math.pow((y - 1.8) / 7.5, 2)) * .6 + .4, top = Math.min(1, Math.max(0, (12.3 - y) / 1.4));
    for (let i = 0; i < W; i++) { const z = -11 + (i / W) * 22, a = Math.exp(-Math.pow(z / ry, 2) * 1.4) * fade * top * .9; const k = (j * W + i) * 4; img.data[k] = img.data[k + 1] = img.data[k + 2] = 255; img.data[k + 3] = Math.floor(255 * Math.min(1, a)); } }
  g.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
