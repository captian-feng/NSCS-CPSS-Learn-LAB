const { build }=require('./package.json')
module.exports={
  ...build,
  directories:{...build.directories,output:'release/textbook'},
  extraResources:[{from:'.local/textbook-ready',to:'bundled-library',filter:['manifest.json','library.sqlite','books/**/*','conversion-report.json']}],
  win:{...build.win,target:['zip'],signAndEditExecutable:false,artifactName:'CPSS-LAB-Windows-Textbook-Ready.zip'}
}
